// One live query, end to end (ARCHITECTURE.md › "One paid query"). Phase 8 slice: retail
// discovery in each market, same-product grouping by title, supplier match, the evidence-only
// margin and the 0.7 confidence gate. Payment never reaches this module (CLAUDE.md Rule 2):
// the route calls it only after x402 has verified the payment.
//
// A result needs strong evidence on BOTH sides: enough independent retail listings agreeing
// on the product and its price, and enough supplier offers matching it. Its confidence is the
// weaker of the two. Anything under the gate is withheld with the reasons (Rule 5).

import type { FxRates } from "@/server/scoring/fx";
import { SourceError, type RetailSource, type SupplierSource } from "@/server/sources/types";
import { BudgetExceededError, QueryBudget, type BudgetLimits } from "./budget";
import { CONFIDENCE_GATE, confidenceOf } from "./confidence";
import { liveMargin, type LiveMargin } from "./margin";
import { searchTermFor, SUPPLIER_MATCH_MIN, supplierMatchScore, titleSimilarity } from "./match";
import { MARKETS, type Evidence, type Market, type RetailListing, type SupplierOffer } from "./types";

export const DEFAULT_LIMITS: BudgetLimits = { maxCalls: 8, deadlineMs: 45_000 };
const SAME_PRODUCT = 0.6; // retail titles this similar are one product
const GROUPS_PER_MARKET = 3; // supplier lookups per market, strongest groups first

export type LiveOpportunity = {
  market: Market;
  title: string;
  confidence: { overall: number; retail: number; supplier: number };
  retail: { listings: RetailListing[] };
  suppliers: { offer: SupplierOffer; match: number }[];
  margin: LiveMargin;
  citations: Evidence[];
};

export type Withheld = {
  market: Market;
  title: string;
  confidence: number;
  missing: string[];
};

export type LiveSearchResult = {
  query: string;
  markets: Market[];
  generatedAt: string;
  confidenceGate: number;
  results: LiveOpportunity[];
  withheld: Withheld[];
  sourceErrors: string[];
  usage: { providerCalls: number };
  notYetApplied: string[];
  disclaimer: string;
};

export type LiveSearchDeps = {
  retail: RetailSource;
  supplier: SupplierSource;
  fx: FxRates;
  now?: () => Date;
  limits?: BudgetLimits;
};

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Greedy grouping in the marketplace's own order: each listing joins the first group it matches. */
export function groupSameProduct(listings: RetailListing[]): RetailListing[][] {
  const groups: RetailListing[][] = [];
  for (const l of listings) {
    const home = groups.find((g) => titleSimilarity(g[0].title, l.title) >= SAME_PRODUCT);
    if (home) home.push(l);
    else groups.push([l]);
  }
  // Most corroborated first; ties keep the marketplace's order.
  return groups.map((g, i) => ({ g, i })).sort((a, b) => b.g.length - a.g.length || a.i - b.i).map(({ g }) => g);
}

function describeFailure(e: unknown): string {
  if (e instanceof SourceError) return e.message;
  if (e instanceof BudgetExceededError) return e.message;
  throw e;
}

export async function runLiveSearch(query: string, markets: Market[], deps: LiveSearchDeps): Promise<LiveSearchResult> {
  const now = deps.now ?? (() => new Date());
  const budget = new QueryBudget(deps.limits ?? DEFAULT_LIMITS);
  const sourceErrors: string[] = [];
  const results: LiveOpportunity[] = [];
  const withheld: Withheld[] = [];

  // Retail discovery: one search per market, in parallel.
  const retailByMarket = await Promise.all(
    markets.map(async (market) => {
      try {
        return { market, listings: await deps.retail.search(query, market, budget) };
      } catch (e) {
        sourceErrors.push(describeFailure(e));
        return { market, listings: [] as RetailListing[] };
      }
    }),
  );

  for (const { market, listings } of retailByMarket) {
    const groups = groupSameProduct(listings).slice(0, GROUPS_PER_MARKET);
    for (const group of groups) {
      const title = group[0].title;
      const asOf = now();
      let offers: SupplierOffer[] = [];
      try {
        offers = await deps.supplier.search(searchTermFor(title), market, budget);
      } catch (e) {
        sourceErrors.push(describeFailure(e));
      }
      const suppliers = offers
        .map((offer) => ({ offer, match: round3(supplierMatchScore(title, offer.title)) }))
        .filter((s) => s.match >= SUPPLIER_MATCH_MIN)
        .sort((a, b) => b.match - a.match);

      const retailC = confidenceOf(group.map((l) => ({ evidence: l.evidence })), asOf);
      const supplierC = confidenceOf(suppliers.map((s) => ({ evidence: s.offer.evidence, match: s.match })), asOf);
      const overall = Math.min(retailC, supplierC);
      const margin = liveMargin(market, MARKETS[market].currency, group.map((l) => l.price), suppliers.map((s) => s.offer), deps.fx);

      const missing: string[] = [];
      if (retailC < CONFIDENCE_GATE) {
        missing.push(`more independent ${MARKETS[market].label} listings of this product (${group.length} found agree on it)`);
      }
      if (suppliers.length === 0) missing.push("an exact supplier match (no exact supplier match found: no supplier listing carries 80% of the product's key words)");
      else if (supplierC < CONFIDENCE_GATE) missing.push(`more or closer supplier matches (${suppliers.length} found)`);
      if (!margin && suppliers.length > 0) missing.push("prices in currencies the ECB publishes, to compare them");

      if (overall >= CONFIDENCE_GATE && margin) {
        results.push({
          market,
          title,
          confidence: { overall: round3(overall), retail: round3(retailC), supplier: round3(supplierC) },
          retail: { listings: group },
          suppliers,
          margin,
          citations: [...group.map((l) => l.evidence), ...suppliers.map((s) => s.offer.evidence)],
        });
      } else {
        withheld.push({ market, title, confidence: round3(overall), missing });
      }
    }
  }

  results.sort((a, b) => b.margin.spreadPct - a.margin.spreadPct);
  return {
    query,
    markets,
    generatedAt: now().toISOString(),
    confidenceGate: CONFIDENCE_GATE,
    results,
    withheld,
    sourceErrors,
    usage: { providerCalls: budget.callsUsed },
    notYetApplied: [
      "brand-restriction filter (branded items may appear)",
      "marketplace fees, VAT, duty and advertising in the margin",
      "sales velocity and saturation",
    ],
    disclaimer:
      "Live, rule-based estimates from the cited listings at the time shown, not guarantees. Results under 0.7 confidence are withheld.",
  };
}
