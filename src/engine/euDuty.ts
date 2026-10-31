// The free EU duty calculator (/tools/eu-duty-calculator): what a UK seller keeps on one item sold to an EU
// consumer after EU VAT, the €3 customs duty and the €2 Union handling fee. Pure arithmetic with no
// validation library, so it runs in the browser as the visitor types. The charges follow the same sourced
// rules as the margin engine (engine/policy.ts: Irish Revenue, 29 September 2026; EU VAT rates from the
// Commission's TEDB), converted to pounds at a stated ECB rate.
//
//   price before VAT    the sale price (what the customer pays, VAT included) less the destination's VAT
//   €150 or less        the €3 customs duty per item type (since 1 July 2026)
//   over €150           the goods' own duty rate instead: only where a sourced rate exists for the
//                       category (Irish Revenue's examples); otherwise it isn't counted, and says so
//   any value           the €2 Union handling fee per distinct item (from 1 November 2026)

import { EU_FIXED_DUTY_EUR, EU_HANDLING_FEE_EUR, EU_LOW_VALUE_THRESHOLD_EUR, EU_STANDARD_VAT } from "./policy";
import { money2 } from "./sellingCosts";

export type EuDutyCategory = {
  id: string;
  label: string;
  /** The customs duty rate over €150, only where a source states it, with what it's the rate for. */
  over150: { rate: number; example: string } | null;
};

/** Common e-commerce categories. Under €150 they all pay the same €3; over it, each pays its own rate. */
export const EU_DUTY_CATEGORIES: EuDutyCategory[] = [
  { id: "clothing", label: "Clothing", over150: { rate: 0.12, example: "jeans" } },
  { id: "footwear", label: "Footwear", over150: { rate: 0.169, example: "trainers (runners)" } },
  { id: "beauty", label: "Beauty & cosmetics", over150: null },
  { id: "home", label: "Home & kitchen", over150: null },
  { id: "electronics", label: "Phone & electronics accessories", over150: null },
  { id: "toys", label: "Toys & games", over150: null },
  { id: "jewellery", label: "Jewellery & accessories", over150: null },
  { id: "other", label: "Something else", over150: null },
];

export const EU_COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria",
  BE: "Belgium",
  DE: "Germany",
  ES: "Spain",
  FR: "France",
  IE: "Ireland",
  IT: "Italy",
  NL: "Netherlands",
  PL: "Poland",
  SE: "Sweden",
};

export type EuDutyInput = {
  /** What the EU customer pays, VAT included, in £. */
  salePrice: number;
  supplierCost: number;
  shipping: number;
  category: string;
  country: string; // ISO code with a rate in EU_STANDARD_VAT
  /** £ per €1, from a dated ECB reference rate. */
  gbpPerEur: number;
};

export type EuDutyResult = {
  vatRate: number;
  vat: number;
  priceBeforeVat: number;
  /** The goods' value in euros (price before VAT): what the €150 line is measured on. */
  valueEur: number;
  lowValue: boolean;
  duty: { amount: number; kind: "flat" | "category_rate" | "not_counted"; note: string };
  handling: number;
  /** What the €3 duty (when it applies) and the €2 fee cost on this sale. */
  newCharges: number;
  profit: number;
  /** Profit as % of the sale price. */
  marginPct: number;
  /** What the sale would keep without the new charges. */
  profitBefore: number;
};

const pct1 = (x: number) => Math.round(x * 1000) / 10;

/** Null until the sale price is a positive number and the country has a VAT rate on file. */
export function euDutyMargin(i: EuDutyInput): EuDutyResult | null {
  const vatRate = EU_STANDARD_VAT[i.country];
  if (vatRate === undefined || !(i.salePrice > 0) || !(i.gbpPerEur > 0)) return null;
  const priceBeforeVat = i.salePrice / (1 + vatRate);
  const vat = money2(i.salePrice - priceBeforeVat);
  const valueEur = Math.round((priceBeforeVat / i.gbpPerEur) * 100) / 100;
  const lowValue = valueEur <= EU_LOW_VALUE_THRESHOLD_EUR;
  const category = EU_DUTY_CATEGORIES.find((c) => c.id === i.category) ?? EU_DUTY_CATEGORIES.at(-1)!;

  let duty: EuDutyResult["duty"];
  if (lowValue) {
    duty = { amount: money2(EU_FIXED_DUTY_EUR * i.gbpPerEur), kind: "flat", note: `€${EU_FIXED_DUTY_EUR} customs duty (the item is €${EU_LOW_VALUE_THRESHOLD_EUR} or less)` };
  } else if (category.over150) {
    duty = {
      amount: money2(category.over150.rate * priceBeforeVat),
      kind: "category_rate",
      note: `${pct1(category.over150.rate)}% customs duty, the rate on ${category.over150.example} (over €${EU_LOW_VALUE_THRESHOLD_EUR}, the item's own rate applies; check your commodity code)`,
    };
  } else {
    duty = {
      amount: 0,
      kind: "not_counted",
      note: `Customs duty at your product's own rate: not counted (over €${EU_LOW_VALUE_THRESHOLD_EUR} the €3 flat duty doesn't apply; the rate depends on the commodity code)`,
    };
  }
  const handling = money2(EU_HANDLING_FEE_EUR * i.gbpPerEur);
  const costs = vat + (i.supplierCost || 0) + (i.shipping || 0) + duty.amount + handling;
  const profit = money2(i.salePrice - costs);
  const newCharges = money2(handling + (duty.kind === "flat" ? duty.amount : 0));
  return {
    vatRate,
    vat,
    priceBeforeVat: money2(priceBeforeVat),
    valueEur,
    lowValue,
    duty,
    handling,
    newCharges,
    profit,
    marginPct: pct1(profit / i.salePrice),
    profitBefore: money2(profit + newCharges),
  };
}
