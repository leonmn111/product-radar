// Phase 8 margin: only what the sources prove (CLAUDE.md Rule 6). The selling price is the
// median of the matching retail listings; the cost is the median matched supplier price plus
// its quoted shipping, converted at the ECB reference rate. Fees, VAT, duty and advertising
// arrive in Phase 9: until then they are named as not included, never estimated.

import { ECB_DAILY_URL, toEur, type FxRates } from "@/server/scoring/fx";
import type { Market, Money, SupplierOffer } from "./types";

const cents = (x: number) => Math.round(x * 100) / 100;

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** `amount` in `to`, via the euro reference rates; null when the ECB doesn't publish one of them. */
export function convert(amount: number, from: string, to: string, fx: FxRates): number | null {
  if (from === to) return amount;
  const eur = toEur(amount, from, fx);
  const rate = to === "EUR" ? 1 : fx.perEur[to];
  return eur === null || !rate ? null : eur * rate;
}

export type LiveMargin = {
  label: string;
  currency: string;
  sellingPrice: number; // median of the matching retail listings
  supplierUnitCost: number; // median matched supplier price, converted
  shippingCost: number | null; // median quoted shipping, converted; null = not quoted
  landedCost: number; // unit cost + shipping where quoted
  spread: number; // sellingPrice − landedCost
  spreadPct: number; // of the selling price
  included: string[];
  notIncluded: string[];
  exchangeRate: { source: string; url: string; date: string } | null;
};

export function liveMargin(
  market: Market,
  currency: string,
  retailPrices: Money[],
  suppliers: SupplierOffer[],
  fx: FxRates,
): LiveMargin | null {
  const sell = retailPrices.filter((p) => p.currency === currency).map((p) => p.amount);
  const units = suppliers.map((s) => convert(s.unitPrice.amount, s.unitPrice.currency, currency, fx)).filter((x): x is number => x !== null);
  if (!sell.length || !units.length) return null;
  const quoted = suppliers
    .filter((s) => s.shipping !== null)
    .map((s) => convert(s.shipping!.amount, s.shipping!.currency, currency, fx))
    .filter((x): x is number => x !== null);
  const sellingPrice = cents(median(sell));
  const supplierUnitCost = cents(median(units));
  const shippingCost = quoted.length ? cents(median(quoted)) : null;
  const landedCost = cents(supplierUnitCost + (shippingCost ?? 0));
  const spread = cents(sellingPrice - landedCost);
  const converted = suppliers.some((s) => s.unitPrice.currency !== currency || (s.shipping && s.shipping.currency !== currency));
  const notIncluded = [
    ...(shippingCost === null ? [`shipping to ${market} (the supplier didn't quote it)`] : []),
    "marketplace fees",
    "VAT",
    "import duty",
    "advertising",
  ];
  return {
    label: shippingCost === null ? "Spread before shipping, fees, VAT, duty and advertising" : "Spread before fees, VAT, duty and advertising",
    currency,
    sellingPrice,
    supplierUnitCost,
    shippingCost,
    landedCost,
    spread,
    spreadPct: sellingPrice > 0 ? Math.round((spread / sellingPrice) * 1000) / 10 : 0,
    included: ["selling price (median of matching listings)", "supplier unit price", ...(shippingCost !== null ? [`shipping to ${market}`] : [])],
    notIncluded,
    exchangeRate: converted ? { source: "European Central Bank euro reference rates", url: ECB_DAILY_URL, date: fx.date } : null,
  };
}
