// Reference data behind the arbitrage engine: the resale fee schedules. Every figure here is copied
// from a published source, with its URL, publication date, the date we read it and a quality score
// (CLAUDE.md Rule 3). Refresh by re-reading the sources below, then bump MARGIN_METHODOLOGY_VERSION in
// engine.ts. (The US Census wholesale benchmark that used to live here was removed in v2.0.0.)

export type SourceRef = {
  name: string;
  url: string;
  publishedAt: string | null; // ISO date the source published this data, if stated
  retrievedAt: string; // ISO date we read it
  qualityScore: number; // 0–100, same scale as Evidence.qualityScore
};

// ── Resale fees ──────────────────────────────────────────────────────────────
// What it costs to resell one unit, for two routes a reseller might take. Each
// schedule applies to the sale price, number for number in any currency.

export type FeeSchedule = {
  rate: number; // share of the sale price
  perOrder: number; // fixed fee per order
  perOrderSmall: number; // fixed fee on orders of `smallOrderMax` or less
  smallOrderMax: number;
  description: string;
  source: SourceRef;
};

// Marketplace: eBay US's standard rate for most categories (incl. health &
// beauty, electronics, phone accessories, home & garden): 13.6% of the sale up
// to $7,500, plus $0.30 per order of $10 or less, otherwise $0.40. Used for every
// currency as a proxy.
//
// Quality 90: the marketplace's own published, current fee schedule.

export const EBAY_FEE_SOURCE: SourceRef = {
  name: "eBay, Selling fees (US, most categories)",
  url: "https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822",
  publishedAt: null,
  retrievedAt: "2026-10-12",
  qualityScore: 90,
};

export const MARKETPLACE_FEE: FeeSchedule = {
  rate: 0.136,
  perOrder: 0.4,
  perOrderSmall: 0.3,
  smallOrderMax: 10,
  description: "13.6% of the sale plus 0.40 per order (0.30 on orders of 10.00 or less), eBay US standard rate",
  source: EBAY_FEE_SOURCE,
};

// Own shop: Shopify Payments online card rates on the Basic plan. Sales in GBP
// use the UK rate (2% + 25p), read from Shopify's own pricing page (quality 90).
// Every other currency uses the US rate (2.9% + 30¢); Shopify's page only showed
// us UK prices, so that figure comes from a dated 2026 fee guide (quality 70).
// The plan's monthly fee and any advertising are not included.

export const SHOPIFY_UK_FEE_SOURCE: SourceRef = {
  name: "Shopify, Pricing (UK): online standard card rates, Basic plan",
  url: "https://www.shopify.com/uk/pricing",
  publishedAt: null,
  retrievedAt: "2026-10-12",
  qualityScore: 90,
};

export const SHOPIFY_US_FEE_SOURCE: SourceRef = {
  name: "CraftShift, Shopify Basic plan 2026: price, fees, and what you actually pay (US card rate)",
  url: "https://craftshift.com/shopify-basic-plan-2026/",
  publishedAt: "2026-07-07",
  retrievedAt: "2026-10-12",
  qualityScore: 70,
};

const OWN_STORE_FEE_GBP: FeeSchedule = {
  rate: 0.02,
  perOrder: 0.25,
  perOrderSmall: 0.25,
  smallOrderMax: 0,
  description: "2% of the sale plus 0.25 per order, Shopify Payments UK online card rate (Basic plan)",
  source: SHOPIFY_UK_FEE_SOURCE,
};

const OWN_STORE_FEE_OTHER: FeeSchedule = {
  rate: 0.029,
  perOrder: 0.3,
  perOrderSmall: 0.3,
  smallOrderMax: 0,
  description: "2.9% of the sale plus 0.30 per order, Shopify Payments US online card rate (Basic plan)",
  source: SHOPIFY_US_FEE_SOURCE,
};

export function ownStoreFee(currency: string): FeeSchedule {
  return currency === "GBP" ? OWN_STORE_FEE_GBP : OWN_STORE_FEE_OTHER;
}
