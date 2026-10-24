// What every UK sale costs whatever the product cost: the VAT inside the retail price and the selling
// platform's fees. Pure arithmetic with no validation library, so the dossier's calculator can run it in
// the browser; engine/margin.ts builds its lines with the same functions, so the two never disagree.

import type { Currency, ExcludedLine, FeeStack, MarginLine } from "@/types/financials";
import { TIKTOK_SHOP_UK_DEFAULT_STACK, UK_LOW_VALUE_THRESHOLD_GBP, UK_VAT_STANDARD } from "./policy";

/** Rounds to the penny / cent, half away from zero, without binary-float surprises (4.165 → 4.17). */
export const money2 = (x: number) => Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100) / 100;
export const pct1 = (x: number) => Math.round(x * 1000) / 10;

type FeeOut = { lines: MarginLine[]; excluded: ExcludedLine[] };

/** The platform's fee lines for one sale, from the price with and without VAT. */
export function feeLines(stack: FeeStack, priceInc: number, priceEx: number, units: number, currency: Currency, out: FeeOut) {
  const add = (label: string, amount: number, b: MarginLine["basis"], evidenceIds: string[]) =>
    out.lines.push({ kind: "platform_fee", label, amount: { amount: money2(amount), currency }, basis: b, evidenceIds });
  const percentOf = (f: { rate: number; base: "price_ex_vat" | "price_inc_vat" }) => f.rate * (f.base === "price_ex_vat" ? priceEx : priceInc);

  if (stack.channel === "tiktok_shop_uk") {
    add(stack.referral.label, percentOf(stack.referral), stack.referral.basis, stack.referral.evidenceIds);
    // Charged once per order: identical units shipped together share it.
    if (stack.perOrder) add(stack.perOrder.label, stack.perOrder.amount / units, stack.perOrder.basis, stack.perOrder.evidenceIds);
    if (stack.creatorCommission) {
      add(stack.creatorCommission.label, percentOf(stack.creatorCommission), stack.creatorCommission.basis, stack.creatorCommission.evidenceIds);
    }
  } else if (stack.channel === "custom") {
    for (const f of stack.fees) add(f.label, f.kind === "percent" ? percentOf(f) : f.amount, f.basis, f.evidenceIds);
  } else {
    add(stack.referral.label, Math.max(percentOf(stack.referral), stack.referral.minimumPerItem ?? 0), stack.referral.basis, stack.referral.evidenceIds);
    add(stack.fulfilmentPerUnit.label, stack.fulfilmentPerUnit.amount, stack.fulfilmentPerUnit.basis, stack.fulfilmentPerUnit.evidenceIds);
    if (stack.storagePerUnit) add(stack.storagePerUnit.label, stack.storagePerUnit.amount, stack.storagePerUnit.basis, stack.storagePerUnit.evidenceIds);
    else out.excluded.push({ kind: "platform_fee", label: "Amazon FBA storage", reason: "no storage fee per unit was given" });
  }
}

export type SellingCosts = {
  retailPrice: number;
  /** The VAT line, then the platform fee lines, as the landed margin lists them. */
  lines: MarginLine[];
  /** VAT plus fees, the sum of the rounded lines. */
  total: number;
  /** Over £135 before VAT, VAT and customs duty are due at import instead, and the duty isn't counted here. */
  collectedAt: "point_of_sale" | "import";
  excluded: ExcludedLine[];
};

/**
 * The VAT and platform fees on one UK sale at `retailPrice` (VAT included), on the TikTok Shop UK
 * default fee stack unless another is given. Same lines, labels and rounding as calculateUKMargin.
 */
export function ukSellingCosts(retailPrice: number, stack: FeeStack = TIKTOK_SHOP_UK_DEFAULT_STACK): SellingCosts {
  const vat = UK_VAT_STANDARD;
  const priceEx = retailPrice / (1 + vat.rate);
  const collectedAt = priceEx <= UK_LOW_VALUE_THRESHOLD_GBP ? "point_of_sale" : "import";
  const out: FeeOut = { lines: [], excluded: [] };
  out.lines.push({
    kind: "vat",
    label: `VAT (${pct1(vat.rate)}% included in the retail price, ${collectedAt === "point_of_sale" ? "collected at the point of sale" : "collected at import"})`,
    amount: { amount: money2(retailPrice - priceEx), currency: "GBP" },
    basis: vat.basis,
    evidenceIds: vat.evidenceIds,
  });
  if (collectedAt === "import") {
    out.excluded.push({ kind: "duty", label: "UK customs duty", reason: `the sale is over £${UK_LOW_VALUE_THRESHOLD_GBP} before VAT, so customs duty applies at the product's commodity-code rate` });
  }
  feeLines(stack, retailPrice, priceEx, 1, "GBP", out);
  return { retailPrice, lines: out.lines, total: money2(out.lines.reduce((s, l) => s + l.amount.amount, 0)), collectedAt, excluded: out.excluded };
}
