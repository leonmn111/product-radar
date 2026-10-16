// Dossier assembly (ARCHITECTURE.md › The product): raw source data in, the 8-part Dossier out.
//
//   fetchDossierData()  the only part that calls providers: Amazon UK listings (Rainforest), then
//                       supplier offers (AliExpress) for the best-corroborated product.
//   buildDossier()      pure: compliance → confidence → the two gates → margins → the Dossier.
//
// Gates (CLAUDE.md Rule 5): below 0.5 the Verdict is withheld; below 0.7 the margin, momentum and
// saturation are withheld as "Insufficient Data". A product that isn't sellable gets its failure
// reasons in Resellability and no financial calculation at all. Nothing withheld is estimated.

import { checkResellability, isSellable } from "@/engine/compliance";
import { calculateConfidence, FINANCIAL_THRESHOLD, VERDICT_THRESHOLD } from "@/engine/confidence";
import { calculateEUMargin, calculateUKMargin } from "@/engine/margin";
import { POLICY_EVIDENCE } from "@/engine/policy";
import { QueryBudget } from "@/server/live/budget";
import { median } from "@/server/live/margin";
import { searchTermFor, titleSimilarity } from "@/server/live/match";
import { groupSameProduct } from "@/server/live/search";
import type { RetailListing, SupplierOffer } from "@/server/live/types";
import type { RetailSource, SupplierSource } from "@/server/sources/types";
import type { Dossier, Evidence, Gated, LandedMargins, Momentum, ResellabilityFlags, Saturation, SupplierMatch, SupplierMatches, Verdict } from "@/types/dossier";
import type { CostInput, FeeStack, ReturnsInput } from "@/types/financials";

const SUPPLIER_MATCH_MIN = 0.5; // a supplier title must match the product at least this well
const LAUNCH_MIN_MARGIN_PCT = 25; // net margin, % of the retail price
const LAUNCH_MIN_ROI_PCT = 50; // net profit ÷ landed cost

// ── Input ────────────────────────────────────────────────────────────────────

/** Everything the Dossier is built from: listings and offers, each carrying its own evidence. */
export type DossierInput = {
  query: string;
  /** Amazon UK listings for the query (Rainforest). */
  ukListings: RetailListing[];
  /** Supplier offers priced for delivery to the UK (AliExpress). */
  suppliers: SupplierOffer[];
  /** EU listings and supplier offers in EUR, and the channel's fees; without them there's no EU margin. */
  eu?: { country: string; listings: RetailListing[]; suppliers: SupplierOffer[]; feeStack: FeeStack } | null;
  /** The caller's own figures; anything missing is excluded from the margin and named. */
  assumptions?: { feeStack?: FeeStack; returns?: ReturnsInput | null; adCostPerSale?: CostInput | null };
  sample?: boolean;
  notes?: string[];
};

// ── Fetching (the only I/O) ──────────────────────────────────────────────────

/**
 * Searches Amazon UK for the query, picks the product most listings agree on, and asks the
 * supplier source for it. A supplier failure is kept as a note (the Dossier is then built on less
 * evidence); a retail failure throws, since there's nothing to build a Dossier from.
 */
export async function fetchDossierData(
  query: string,
  sources: { retail: RetailSource; supplier: SupplierSource },
  budget: QueryBudget = new QueryBudget({ maxCalls: 3, deadlineMs: 30_000 }),
): Promise<DossierInput> {
  const ukListings = await sources.retail.search(query, "GB", budget);
  const top = groupSameProduct(ukListings)[0];
  const notes: string[] = [];
  let suppliers: SupplierOffer[] = [];
  if (top) {
    try {
      suppliers = await sources.supplier.search(searchTermFor(top[0].title), "GB", budget);
    } catch (e) {
      notes.push(`Supplier search failed (${e instanceof Error ? e.message : "unknown error"}), so no supplier evidence was used.`);
    }
  }
  return { query, ukListings, suppliers, notes };
}

// ── Pure assembly ────────────────────────────────────────────────────────────

const toEvidence = (e: RetailListing["evidence"], sourceType: Evidence["sourceType"], value: number, matchScore?: number): Evidence => ({
  id: e.id,
  provider: e.provider,
  sourceType,
  sourceUrl: e.sourceUrl,
  observedAt: e.observedAt,
  publishedAt: null,
  quality: e.quality,
  claim: e.claim,
  value,
  ...(matchScore === undefined ? {} : { matchScore }),
});

const withheld = <T>(reason: "Insufficient Data" | "Not Sellable", confidence: number, missing: string[]): Gated<T> => ({
  status: "withheld",
  reason,
  confidence,
  missing,
});

const tripped = (flags: ResellabilityFlags) =>
  (Object.entries(flags) as [keyof ResellabilityFlags, ResellabilityFlags[keyof ResellabilityFlags]][]).filter(([, f]) => f.value === true);

/** A cost line from medians of cited prices: the evidence is every listing the median came from. */
const medianInput = (items: { price: number; evidenceId: string }[]): CostInput => ({
  amount: Math.round(median(items.map((i) => i.price)) * 100) / 100,
  basis: "sourced",
  evidenceIds: items.map((i) => i.evidenceId),
});

function decideVerdict(args: {
  confidence: number;
  flags: ResellabilityFlags;
  supplierCount: number;
  margins: LandedMargins | null;
}): Verdict {
  const blocked = tripped(args.flags);
  if (blocked.length) return { kind: "AVOID", reasons: blocked.map(([name, f]) => `${name}: ${f.reason}`) };
  if (args.supplierCount === 0) return { kind: "AVOID", reasons: ["No supplier listing matches this product, so it can't be sourced."] };
  const uk = args.margins?.uk;
  if (!uk) {
    return { kind: "TEST", reasons: ["Sellable and matched to a supplier, but the evidence is too thin to show the numbers yet."] };
  }
  const profit = `£${uk.netProfit.amount.toFixed(2)} net per unit (${uk.netMarginPct}% of the price)`;
  if (uk.netProfit.amount <= 0) return { kind: "AVOID", reasons: [`Loses money: ${profit}.`] };
  if (uk.complete && uk.netMarginPct >= LAUNCH_MIN_MARGIN_PCT && uk.roiPercentage >= LAUNCH_MIN_ROI_PCT) {
    return { kind: "LAUNCH", reasons: [`${profit}, ${uk.roiPercentage}% return on landed cost, every cost accounted for.`] };
  }
  const gaps = uk.excluded.map((x) => x.label.toLowerCase());
  return {
    kind: "TEST",
    reasons: [
      `${profit}, ${uk.roiPercentage}% return on landed cost.`,
      ...(gaps.length ? [`Not yet counted: ${gaps.join(", ")}. Test with a small order before scaling.`] : []),
    ],
  };
}

/** Builds the 8-part Dossier from source data. Pure: `ctx` supplies the id and the time. */
export function buildDossier(input: DossierInput, ctx: { id: string; now: Date }): Dossier {
  const notes = [...(input.notes ?? [])];
  const group = groupSameProduct(input.ukListings)[0] ?? [];
  if (group.length === 0) throw new Error("buildDossier needs at least one listing");
  const lead = group[0];

  // Suppliers that match the product, best first, in one currency (nothing is converted here).
  const matchIn = (offers: SupplierOffer[], currency: string) =>
    offers
      .filter((o) => o.unitPrice.currency === currency)
      .map((offer) => ({ offer, score: Math.round(titleSimilarity(lead.title, offer.title) * 1000) / 1000 }))
      .filter((m) => m.score >= SUPPLIER_MATCH_MIN)
      .sort((a, b) => b.score - a.score);
  const matched = matchIn(input.suppliers, "GBP");
  const skippedCurrency = input.suppliers.filter((o) => o.unitPrice.currency !== "GBP").length;
  if (skippedCurrency) notes.push(`${skippedCurrency} supplier offer(s) weren't priced in GBP and were left out (nothing is converted here).`);

  const retailEvidence = group.map((l) => toEvidence(l.evidence, "marketplace", l.price.amount));
  const supplierEvidence = matched.map((m) => toEvidence(m.offer.evidence, "supplier", m.offer.unitPrice.amount, m.score));

  // 1. Compliance first: a product that can't be resold gets no financial calculation.
  const flags = checkResellability({ title: lead.title, brand: null, sellerName: null, category: null, market: "UK", evidenceIds: group.map((l) => l.evidence.id) });
  const sellable = isSellable(flags);

  // 2. Confidence over every source, supplier evidence weighed by how well it matches.
  const confidence = calculateConfidence([...retailEvidence, ...supplierEvidence], ctx.now);
  const evidenceGap = [
    ...(group.length < 4 ? [`more independent Amazon UK listings of this product (${group.length} found agree on it)`] : []),
    ...(matched.length === 0 ? ["a supplier listing that matches this product"] : matched.length < 3 ? [`more or closer supplier matches (${matched.length} found)`] : []),
  ];

  // 3. The financial gate, then the margins.
  let landedMargin: Gated<LandedMargins>;
  let margins: LandedMargins | null = null;
  if (!sellable) {
    landedMargin = withheld("Not Sellable", confidence, tripped(flags).map(([name]) => `${name} is tripped`));
  } else if (confidence < FINANCIAL_THRESHOLD || matched.length === 0) {
    landedMargin = withheld("Insufficient Data", confidence, evidenceGap.length ? evidenceGap : ["more evidence"]);
  } else {
    const uk = calculateUKMargin({
      retailPrice: medianInput(group.map((l) => ({ price: l.price.amount, evidenceId: l.evidence.id }))),
      supplierCost: medianInput(matched.map((m) => ({ price: m.offer.unitPrice.amount, evidenceId: m.offer.evidence.id }))),
      shipping: null, // the supplier source doesn't quote shipping yet
      returns: input.assumptions?.returns ?? null,
      adCostPerSale: input.assumptions?.adCostPerSale ?? null,
      feeStack: input.assumptions?.feeStack,
    });
    const euListings = input.eu?.listings.filter((l) => l.price.currency === "EUR") ?? [];
    const euMatched = input.eu ? matchIn(input.eu.suppliers, "EUR") : [];
    const eu =
      input.eu && euListings.length && euMatched.length
        ? calculateEUMargin({
            country: input.eu.country,
            feeStack: input.eu.feeStack,
            retailPrice: medianInput(euListings.map((l) => ({ price: l.price.amount, evidenceId: l.evidence.id }))),
            supplierCost: medianInput(euMatched.map((m) => ({ price: m.offer.unitPrice.amount, evidenceId: m.offer.evidence.id }))),
            shipping: null,
            returns: input.assumptions?.returns ?? null,
            adCostPerSale: input.assumptions?.adCostPerSale ?? null,
          })
        : null;
    if (!eu) notes.push("No EU margin: it needs EU listings and EUR supplier prices for the destination country.");
    margins = { uk, eu };
    landedMargin = { status: "shown", confidence, value: margins, evidenceIds: [...new Set([...uk.evidenceIds, ...(eu?.evidenceIds ?? [])])] };
  }

  // 4. Saturation and momentum share the financial gate.
  const saturation: Gated<Saturation> =
    confidence < FINANCIAL_THRESHOLD
      ? withheld("Insufficient Data", confidence, evidenceGap.length ? evidenceGap : ["more evidence"])
      : {
          status: "shown",
          confidence,
          value: { sellerCount: group.length, storeCount: new Set(group.map((l) => new URL(l.url).hostname)).size, adDensity: null },
          evidenceIds: group.map((l) => l.evidence.id),
        };
  // No trend history, velocity or ad data is collected yet, so momentum can't be shown at any confidence.
  const momentum: Gated<Momentum> = withheld("Insufficient Data", confidence, [
    "12 weeks of daily trend history (the daily snapshot job)",
    "sales velocity (Keepa, Phase 1)",
    "ad duration (Meta Ad Library, Phase 2)",
  ]);

  // 5. The verdict gate.
  const verdict: Gated<Verdict> =
    confidence < VERDICT_THRESHOLD
      ? withheld("Insufficient Data", confidence, evidenceGap.length ? evidenceGap : ["more evidence"])
      : {
          status: "shown",
          confidence,
          value: decideVerdict({ confidence, flags, supplierCount: matched.length, margins }),
          evidenceIds: [...retailEvidence, ...supplierEvidence].map((e) => e.id),
        };

  const supplierMatches = matched.slice(0, 3).map(
    ({ offer, score }): SupplierMatch => ({
      platform: "aliexpress",
      listingUrl: offer.url,
      title: offer.title,
      unitPrice: { amount: offer.unitPrice.amount, currency: "GBP" },
      moq: null, // the affiliate API doesn't state one
      deliveryDays: null, // not quoted by the source yet
      matchScore: score,
      evidenceIds: [offer.evidence.id],
    }),
  ) as SupplierMatches;

  // Every evidence item the Dossier rests on, including the tax and fee rules its margins cite.
  const used = new Set(landedMargin.status === "shown" ? landedMargin.evidenceIds : []);
  const evidence = [...retailEvidence, ...supplierEvidence, ...POLICY_EVIDENCE.filter((e) => used.has(e.id))];

  return {
    id: ctx.id,
    generatedAt: ctx.now.toISOString(),
    product: {
      title: lead.title,
      query: input.query,
      market: "UK",
      country: "GB",
      currency: "GBP",
      identifiers: { asin: lead.id, supplierIds: matched.map((m) => m.offer.id) },
    },
    sample: input.sample ?? false,
    notes,
    verdict,
    resellability: flags,
    landedMargin,
    momentum,
    saturation,
    supplierMatches,
    evidence,
    exports: { shopifyCsvUrl: null, pdfUrl: null, shareLink: null },
  };
}
