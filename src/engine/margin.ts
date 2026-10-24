// Landed margin for the UK and the EU (ARCHITECTURE.md › Landed margin model). Pure functions: no I/O,
// no clock. Inputs are validated with Zod; every line in the result says how it is known and which
// evidence it rests on, and a part of the formula that can't be sourced goes in `excluded` instead
// of being guessed (CLAUDE.md Rules 3 and 6).
//
//   UK:  Net Profit = Retail − (Supplier + Shipping + VAT + Platform fees + Returns + Ad cost)
//   EU:  Net Profit = Retail − (Supplier + Shipping + €3 duty + €2 handling + VAT + Platform fees
//                               + Returns + Ad cost)
//
// Conventions: amounts are per unit in the market's currency (GBP / EUR); the retail price includes
// VAT, so VAT = price × r / (1 + r); each line is rounded to the penny / cent and totals are the sum of
// the rounded lines. ROI = net profit ÷ landed cost (supplier + shipping + duty + handling).

import { z } from "zod";
import type { Currency, FeeStack, LandedMargin, MarginLine, ExcludedLine, EUMarginParams, UKMarginParams } from "@/types/financials";
import { feeLines, money2, pct1 } from "./sellingCosts";
import {
  EU_DUTY_EVIDENCE,
  EU_FIXED_DUTY_EUR,
  EU_HANDLING_FEE_EUR,
  EU_HANDLING_FEE_EVIDENCE,
  EU_LOW_VALUE_THRESHOLD_EUR,
  EU_STANDARD_VAT,
  EU_VAT_EVIDENCE,
  TIKTOK_SHOP_UK_DEFAULT_STACK,
  UK_LOW_VALUE_EVIDENCE,
  UK_LOW_VALUE_THRESHOLD_GBP,
  UK_VAT_STANDARD,
} from "./policy";

// ── Validation ───────────────────────────────────────────────────────────────

export class MarginInputError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid margin input: ${issues.join("; ")}`);
    this.name = "MarginInputError";
  }
}

const basis = z.enum(["sourced", "caller_supplied", "estimate"]);
const ids = z.array(z.string().min(1));
// Rule 3: a figure that claims to be sourced must point at its evidence.
const citedWhenSourced = (v: { basis: string; evidenceIds: string[] }) => v.basis !== "sourced" || v.evidenceIds.length > 0;
const SOURCED_MSG = "a sourced figure needs at least one evidence id";

const cost = z.object({ amount: z.number().finite().nonnegative(), basis, evidenceIds: ids }).refine(citedWhenSourced, SOURCED_MSG);
const positiveCost = z
  .object({ amount: z.number().finite().positive(), basis, evidenceIds: ids })
  .refine(citedWhenSourced, SOURCED_MSG);
const rate = z.object({ rate: z.number().min(0).max(1), basis, evidenceIds: ids }).refine(citedWhenSourced, SOURCED_MSG);
const percentFee = z
  .object({ kind: z.literal("percent"), label: z.string().min(1), rate: z.number().min(0).max(1), base: z.enum(["price_ex_vat", "price_inc_vat"]), basis, evidenceIds: ids })
  .refine(citedWhenSourced, SOURCED_MSG);
const fixedFee = z
  .object({ kind: z.literal("fixed"), label: z.string().min(1), amount: z.number().finite().nonnegative(), basis, evidenceIds: ids })
  .refine(citedWhenSourced, SOURCED_MSG);
const feeStack = z.union([
  z.object({ channel: z.literal("tiktok_shop_uk"), referral: percentFee, perOrder: fixedFee.nullable(), creatorCommission: percentFee.nullable() }),
  z.object({
    channel: z.enum(["amazon_uk_fba", "amazon_eu_fba"]),
    marketplace: z.string().min(1),
    referral: z.intersection(percentFee, z.object({ minimumPerItem: z.number().nonnegative().nullable() })),
    fulfilmentPerUnit: fixedFee,
    storagePerUnit: fixedFee.nullable(),
  }),
  z.object({ channel: z.literal("custom"), name: z.string().min(1), fees: z.array(z.union([percentFee, fixedFee])) }),
]);
const returns = z
  .object({ returnRate: z.number().min(0).max(1), costPerReturn: z.number().finite().nonnegative(), basis, evidenceIds: ids })
  .refine(citedWhenSourced, SOURCED_MSG);
const baseShape = {
  retailPrice: positiveCost,
  supplierCost: positiveCost,
  shipping: cost.nullable(),
  returns: returns.nullable(),
  adCostPerSale: cost.nullable(),
  unitsPerParcel: z.number().int().positive().default(1),
};
const UKParams = z.object({ ...baseShape, feeStack: feeStack.optional(), vatRate: rate.optional() });
const EUParams = z.object({
  ...baseShape,
  country: z.string().regex(/^[A-Z]{2}$/, "country must be an ISO code like DE"),
  feeStack,
  vatRate: rate.optional(),
  includeProposedHandlingFee: z.boolean().default(true),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new MarginInputError(r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`));
  return r.data;
}

// ── Arithmetic ───────────────────────────────────────────────────────────────
// money2, pct1 and feeLines live in sellingCosts.ts (no validation library there), so the dossier's
// calculator runs the very same VAT and fee arithmetic in the browser.

const sum = (xs: number[]) => money2(xs.reduce((a, b) => a + b, 0));

type Built = { lines: MarginLine[]; excluded: ExcludedLine[]; extraEvidence: string[] };

type Common = z.infer<typeof UKParams> | z.infer<typeof EUParams>;

/** Lines shared by both markets, in formula order around the market-specific duty and VAT lines. */
function assemble(
  p: Common,
  ctx: { market: "UK" | "EU"; country: string; currency: Currency; vat: { rate: number; basis: MarginLine["basis"]; evidenceIds: string[] }; stack: FeeStack },
  dutyAndHandling: (out: Built, priceEx: number) => "point_of_sale" | "import",
): LandedMargin {
  const { currency } = ctx;
  const m = (amount: number) => ({ amount: money2(amount), currency });
  const out: Built = { lines: [], excluded: [], extraEvidence: [] };
  const priceInc = p.retailPrice.amount;
  const priceEx = priceInc / (1 + ctx.vat.rate);

  out.lines.push({ kind: "supplier", label: "Supplier unit cost", amount: m(p.supplierCost.amount), basis: p.supplierCost.basis, evidenceIds: p.supplierCost.evidenceIds });
  if (p.shipping) out.lines.push({ kind: "shipping", label: "Shipping per unit", amount: m(p.shipping.amount), basis: p.shipping.basis, evidenceIds: p.shipping.evidenceIds });
  else out.excluded.push({ kind: "shipping", label: "Shipping per unit", reason: "no shipping cost was quoted" });

  const collectedAt = dutyAndHandling(out, priceEx);

  out.lines.push({
    kind: "vat",
    label: `VAT (${pct1(ctx.vat.rate)}% included in the retail price, ${collectedAt === "point_of_sale" ? "collected at the point of sale" : "collected at import"})`,
    amount: m(priceInc - priceEx),
    basis: ctx.vat.basis,
    evidenceIds: ctx.vat.evidenceIds,
  });

  feeLines(ctx.stack, priceInc, priceEx, p.unitsPerParcel, currency, out);

  if (p.returns) {
    out.lines.push({
      kind: "returns",
      label: `Returns allowance (${pct1(p.returns.returnRate)}% × ${p.returns.costPerReturn.toFixed(2)} per return)`,
      amount: m(p.returns.returnRate * p.returns.costPerReturn),
      basis: p.returns.basis,
      evidenceIds: p.returns.evidenceIds,
    });
  } else out.excluded.push({ kind: "returns", label: "Returns allowance", reason: "no return rate was given" });

  if (p.adCostPerSale) {
    out.lines.push({ kind: "ad_cost", label: "Ad cost per sale (CAC)", amount: m(p.adCostPerSale.amount), basis: p.adCostPerSale.basis, evidenceIds: p.adCostPerSale.evidenceIds });
  } else out.excluded.push({ kind: "ad_cost", label: "Ad cost per sale (CAC)", reason: "no ad cost per sale was given; breakEvenAdCost shows the most a sale can spend" });

  const amountsOf = (kinds: MarginLine["kind"][]) => out.lines.filter((l) => kinds.includes(l.kind)).map((l) => l.amount.amount);
  const totalCosts = sum(out.lines.map((l) => l.amount.amount));
  const landedCost = sum(amountsOf(["supplier", "shipping", "duty", "handling"]));
  const adCost = sum(amountsOf(["ad_cost"]));
  const netProfit = money2(priceInc - totalCosts);

  return {
    market: ctx.market,
    country: ctx.country,
    channel: ctx.stack.channel,
    currency,
    retailPrice: m(priceInc),
    lines: out.lines,
    totalCosts: m(totalCosts),
    landedCost: m(landedCost),
    netProfit: m(netProfit),
    netMarginPct: pct1(netProfit / priceInc),
    roiPercentage: pct1(netProfit / landedCost),
    breakEvenAdCost: m(netProfit + adCost),
    vat: { rate: ctx.vat.rate, collectedAt },
    excluded: out.excluded,
    complete: out.excluded.length === 0,
    evidenceIds: [...new Set([...out.lines.flatMap((l) => l.evidenceIds), ...out.extraEvidence, ...p.retailPrice.evidenceIds])],
  };
}

// ── UK ───────────────────────────────────────────────────────────────────────

/**
 * UK: VAT is taken out of the retail price; for consignments of £135 or less (price before VAT ×
 * units) it is collected at the point of sale and no customs duty applies. Above £135, VAT and
 * customs duty apply at import, and the duty (set by the commodity code) is named as excluded.
 * The fee stack defaults to TikTok Shop UK: 9% + £0.50 + 15% creator commission.
 */
export function calculateUKMargin(params: UKMarginParams): LandedMargin {
  const p = parse(UKParams, params);
  const vat = p.vatRate ?? UK_VAT_STANDARD;
  return assemble(p, { market: "UK", country: "GB", currency: "GBP", vat, stack: p.feeStack ?? TIKTOK_SHOP_UK_DEFAULT_STACK }, (out, priceEx) => {
    out.extraEvidence.push(UK_LOW_VALUE_EVIDENCE.id);
    if (priceEx * p.unitsPerParcel <= UK_LOW_VALUE_THRESHOLD_GBP) return "point_of_sale";
    out.excluded.push({
      kind: "duty",
      label: "UK customs duty",
      reason: `the consignment is over £${UK_LOW_VALUE_THRESHOLD_GBP}, so customs duty applies at the product's commodity-code rate, which wasn't given`,
    });
    return "import";
  });
}

// ── EU ───────────────────────────────────────────────────────────────────────

/**
 * EU: for parcels of €150 or less (price before VAT × units), VAT is charged at the sale through
 * IOSS at the destination country's rate, plus the fixed €3 customs duty per item type in the
 * parcel (identical units share it) and, unless switched off, the proposed €2 handling fee per item.
 * Above €150 the low-value rules don't apply: VAT is collected at import and the duty (set by the
 * commodity code) is named as excluded.
 */
export function calculateEUMargin(params: EUMarginParams): LandedMargin {
  const p = parse(EUParams, params);
  const defaultRate = EU_STANDARD_VAT[p.country];
  if (!p.vatRate && defaultRate === undefined) {
    throw new MarginInputError([`vatRate: no standard VAT rate on file for ${p.country}; pass vatRate with its source`]);
  }
  const vat = p.vatRate ?? { rate: defaultRate!, basis: "sourced" as const, evidenceIds: [EU_VAT_EVIDENCE.id] };
  return assemble(p, { market: "EU", country: p.country, currency: "EUR", vat, stack: p.feeStack }, (out, priceEx) => {
    if (priceEx * p.unitsPerParcel > EU_LOW_VALUE_THRESHOLD_EUR) {
      out.excluded.push({
        kind: "duty",
        label: "EU customs duty",
        reason: `the parcel is over €${EU_LOW_VALUE_THRESHOLD_EUR}, so customs duty applies at the product's commodity-code rate, which wasn't given`,
      });
      return "import";
    }
    out.lines.push({
      kind: "duty",
      label: `EU fixed customs duty (€${EU_FIXED_DUTY_EUR} per item type in the parcel${p.unitsPerParcel > 1 ? `, shared by ${p.unitsPerParcel} units` : ""})`,
      amount: { amount: money2(EU_FIXED_DUTY_EUR / p.unitsPerParcel), currency: "EUR" },
      basis: "sourced",
      evidenceIds: [EU_DUTY_EVIDENCE.id],
    });
    if (p.includeProposedHandlingFee) {
      out.lines.push({
        kind: "handling",
        label: `EU customs handling fee (€${EU_HANDLING_FEE_EUR} per item; proposed, not yet adopted)`,
        amount: { amount: EU_HANDLING_FEE_EUR, currency: "EUR" },
        basis: "estimate",
        evidenceIds: [EU_HANDLING_FEE_EVIDENCE.id],
      });
    } else {
      out.excluded.push({ kind: "handling", label: "EU customs handling fee", reason: "proposed but not adopted; left out at the caller's request" });
    }
    return "point_of_sale";
  });
}
