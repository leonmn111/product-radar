// The homepage's quick check (POST /api/free-verdict): a product's UK selling price, from its Dossier's
// Amazon UK listings, against a supplier price, through the same UK margin engine and the same hard gates
// as every other verdict (engine/verdict.ts). Pure: the route fetches the Dossier and the price.
//
//   G3  a brand or trademark on the product being sold → "Avoid (brand-restricted)", nothing priced
//   the UK price needs 0.7 confidence (CLAUDE.md Rule 5), about four current listings of the product;
//   below that the verdict is "Not enough evidence" and no money figure is shown
//   G1  £0 or less per sale before ads → "Avoid", "Loses £X per sale before ads"
//   otherwise "Test small": shipping, returns and the seller's ad cost are never known here, so the
//   profit is never fully proven and a quick check never says Launch.
//
// The breakdown behind the email gate adds every cost line, the worst case and an ad-test plan, all
// arithmetic on the same figures. The test is TEST_UNITS units, a stated plan, not a forecast.

import { checkResellability } from "@/engine/compliance";
import { calculateConfidence, FINANCIAL_THRESHOLD } from "@/engine/confidence";
import { calculateUKMargin } from "@/engine/margin";
import { POLICY_EVIDENCE } from "@/engine/policy";
import { money2 } from "@/engine/sellingCosts";
import { brandRestricted, BRAND_RESTRICTED_REASON, profitGate, verdictLabel } from "@/engine/verdict";
import { median } from "@/server/live/margin";
import type { Dossier, Evidence, ResellabilityFlags, VerdictGate } from "@/types/dossier";
import type { CostInput, LandedMargin } from "@/types/financials";
import type { QuickBreakdown, QuickTier, SupplierPriceSource } from "@/types/quickCheck";

/** The units in the breakdown's ad test: a small first order, stated as the plan's own assumption. */
export const TEST_UNITS = 10;
/** Listings that clear the 0.7 numbers gate on their own (engine/confidence.ts). */
const CORROBORATED = 4;

export type QuickSupplier = { amount: number; source: SupplierPriceSource; evidence: Evidence | null };

export type QuickResult = {
  tier: QuickTier;
  gate: VerdictGate | null;
  label: string;
  reason: string | null;
  missing: string[];
  sellingPrice: number | null;
  margin: LandedMargin | null;
  retail: Evidence[];
};

const gbp = (x: number) => `£${Math.abs(x).toFixed(2)}`;

/** "£4.50", "4.5", " 12 " → pounds; blank → null; anything else (or out of range) → NaN. */
export function parseSupplierPrice(v: unknown): number | null {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 10_000 ? Math.round(n * 100) / 100 : NaN;
}

/** The resale checks on what the visitor would sell: the Amazon listing itself, or the pasted product's own name. */
export function subjectFlags(d: Dossier, pasted: { name: string; brand: string | null } | null): ResellabilityFlags {
  return pasted ? checkResellability({ title: pasted.name, brand: pasted.brand, market: "UK" }) : d.resellability;
}

/** The Amazon UK listings of the product in its Dossier: the evidence its selling price comes from. */
export const retailEvidence = (d: Dossier) => d.evidence.filter((e) => e.sourceType === "marketplace" && typeof e.value === "number" && e.value > 0);

/** The supplier price when the visitor gave none: the median of the Dossier's exact AliExpress matches, if any. */
export function matchedSupplier(d: Dossier): QuickSupplier | null {
  if (d.supplierMatches.length === 0) return null;
  return { amount: Math.round(median(d.supplierMatches.map((m) => m.unitPrice.amount)) * 100) / 100, source: "aliexpress_matches", evidence: null };
}

/**
 * The quick verdict. `flags` are the resale checks on what the visitor would sell: the Amazon product's own
 * for an Amazon link, the pasted product's for an AliExpress or TikTok Shop link (whose UK price is borrowed
 * from the matching Amazon listing).
 */
export function quickVerdict(d: Dossier, flags: ResellabilityFlags, supplier: QuickSupplier | null, now: Date): QuickResult {
  const retail = retailEvidence(d);
  const base = { retail, sellingPrice: null, margin: null, missing: [] as string[] };
  const result = (tier: QuickTier, reason: string | null, gate: VerdictGate | null = null, extra: Partial<QuickResult> = {}): QuickResult => ({
    ...base,
    tier,
    gate,
    label: verdictLabel(tier, gate),
    reason,
    ...extra,
  });

  // G3, before anything else.
  if (brandRestricted(flags)) return result("AVOID", BRAND_RESTRICTED_REASON, "G3_BRAND");

  // The UK price, gated at 0.7 like every number.
  const confidence = calculateConfidence(retail, now);
  if (retail.length === 0 || confidence < FINANCIAL_THRESHOLD) {
    return result("WITHHELD", "We couldn't confirm what it sells for in the UK yet, so no money figure is shown.", null, {
      missing: [`more current Amazon UK listings of this product to confirm its price (${retail.length} found; about ${CORROBORATED} are needed)`],
    });
  }
  const priceInput: CostInput = {
    amount: Math.round(median(retail.map((e) => e.value as number)) * 100) / 100,
    basis: "sourced",
    evidenceIds: retail.map((e) => e.id),
  };
  if (!supplier) {
    return result("WITHHELD", "Add your supplier price to see what you'd keep.", null, {
      sellingPrice: priceInput.amount,
      missing: ["your supplier price (no exact AliExpress match was found for this product)"],
    });
  }

  const margin = calculateUKMargin({
    retailPrice: priceInput,
    supplierCost: {
      amount: supplier.amount,
      basis: supplier.source === "you" ? "caller_supplied" : "sourced",
      evidenceIds: supplier.evidence ? [supplier.evidence.id] : supplier.source === "aliexpress_matches" ? d.supplierMatches.flatMap((m) => m.evidenceIds) : [],
    },
    shipping: null,
    returns: null,
    adCostPerSale: null,
  });
  const extra = { sellingPrice: priceInput.amount, margin };
  // G1: TikTok Shop UK is the one channel modelled here, so it is the cheapest.
  const loss = profitGate([margin]);
  if (loss) return result("AVOID", `${loss.reason}.`, "G1_PROFIT", extra);
  return result("TEST", null, null, extra);
}

/** The full breakdown behind the email gate. Only for a verdict that has a margin. */
export function quickBreakdown(
  d: Dossier,
  q: QuickResult,
  supplier: QuickSupplier,
  freeLeft: number,
): QuickBreakdown | null {
  const m = q.margin;
  if (!m) return null;
  const keep = m.breakEvenAdCost.amount;
  const breakEvenAdCost = Math.max(0, keep);
  const stock = money2(TEST_UNITS * supplier.amount);
  const adBudget = money2(TEST_UNITS * breakEvenAdCost);
  const breakEvenSupplierPrice = Math.max(0, money2(supplier.amount + keep));
  const plan =
    keep > 0
      ? [
          `Order ${TEST_UNITS} units first: ${gbp(stock)} of stock.`,
          `Cap your ad spend at ${gbp(breakEvenAdCost)} per sale: that's your break-even, the most a sale can spend on ads before it loses money.`,
          `Give the test ${gbp(adBudget)} of ads at most (${TEST_UNITS} sales at your break-even). If your ad cost per sale stays under ${gbp(breakEvenAdCost)}, order more; if not, stop.`,
        ]
      : [
          `Don't advertise it at this supplier price: it loses ${gbp(keep)} per sale before any ad spend.`,
          `It only breaks even with a supplier price under ${gbp(breakEvenSupplierPrice)}. Find a cheaper supplier or a higher selling price first.`,
        ];
  const used = new Set(m.evidenceIds);
  return {
    product: { asin: d.product.identifiers.asin ?? "", title: d.product.title, url: `https://www.amazon.co.uk/dp/${d.product.identifiers.asin ?? ""}` },
    sellingPrice: {
      amount: m.retailPrice.amount,
      listings: q.retail.length,
      sources: q.retail.map((e) => ({ url: e.sourceUrl, claim: e.claim })),
    },
    lines: m.lines.map((l) => ({
      label: l.kind === "supplier" ? `Supplier cost (${supplier.source === "you" ? "your price" : supplier.source === "aliexpress_link" ? "the AliExpress listing you pasted" : "median of the matched AliExpress listings"})` : l.label,
      amount: l.amount.amount,
      basis: l.basis,
    })),
    keepPerSale: keep,
    notCounted: m.excluded.filter((x) => x.kind !== "ad_cost").map((x) => x.label),
    breakEvenAdCost,
    breakEvenSupplierPrice,
    // If none of the test sells: the stock, plus the whole ad budget if it was spent.
    worstCase: { testUnits: TEST_UNITS, stock, adBudget, total: money2(stock + adBudget) },
    adTestPlan: plan,
    rules: POLICY_EVIDENCE.filter((e) => used.has(e.id)).map((e) => ({ label: e.claim, url: e.sourceUrl })),
    supplierSource: supplier.evidence ? { url: supplier.evidence.sourceUrl, claim: supplier.evidence.claim } : null,
    freeLeft,
  };
}
