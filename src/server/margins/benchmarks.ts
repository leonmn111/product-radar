// Reference data behind the margin engine. Every figure here is copied from a
// published source, with its URL, publication date, the date we read it and a
// quality score (CLAUDE.md Rule 3). Refresh by re-reading the sources below,
// then bump MARGIN_METHODOLOGY_VERSION in engine.ts.

export type SourceRef = {
  name: string;
  url: string;
  publishedAt: string | null; // ISO date the source published this data, if stated
  retrievedAt: string; // ISO date we read it
  qualityScore: number; // 0–100, same scale as Evidence.qualityScore
};

// ── Wholesale cost benchmark ─────────────────────────────────────────────────
// A retailer's gross margin is (sales − cost of goods sold) / sales, so the
// wholesale cost of an item is about retail × (1 − gross margin). The US Census
// Bureau publishes that margin by kind of store every year.
//
// Quality 60: official statistics, but an average over everything those stores
// sell, US only and up to 2022, so it describes the category, not the product.

export const CENSUS_GROSS_MARGIN_SOURCE: SourceRef = {
  name: "US Census Bureau, Annual Retail Trade Survey: Gross Margin as a Percentage of Sales (1993–2022)",
  url: "https://www2.census.gov/programs-surveys/arts/tables/2022benchmarked/gmper.xlsx",
  publishedAt: "2026-08-31",
  retrievedAt: "2026-10-12",
  qualityScore: 60,
};

export const BENCHMARK_YEARS = [2018, 2019, 2020, 2021, 2022] as const;

export type StoreType = {
  naicsCode: string | null; // null for the all-retail total
  name: string;
  // Gross margin as % of sales, in BENCHMARK_YEARS order, as published (2018–2022 revised).
  grossMarginPct: readonly [number, number, number, number, number];
};

export const STORE_TYPES = {
  healthPersonalCare: { naicsCode: "4461", name: "Health and personal care stores", grossMarginPct: [29.1, 29.1, 28.3, 30.0, 32.9] },
  shoe: { naicsCode: "4482", name: "Shoe stores", grossMarginPct: [46.8, 47.2, 42.1, 50.8, 50.9] },
  electronicsAppliance: { naicsCode: "443", name: "Electronics and appliance stores", grossMarginPct: [31.0, 30.7, 28.8, 33.4, 29.4] },
  buildingGarden: {
    naicsCode: "444",
    name: "Building material and garden equipment and supplies dealers",
    grossMarginPct: [34.4, 34.4, 35.3, 36.2, 35.6],
  },
  allRetail: {
    naicsCode: null,
    name: "All retail stores (excluding motor vehicle and parts dealers)",
    grossMarginPct: [32.1, 32.0, 32.4, 33.8, 32.9],
  },
} as const satisfies Record<string, StoreType>;

/**
 * The store type whose margins stand in for each ProductRadar category. Beauty
 * uses health and personal care stores: the Census table doesn't publish
 * cosmetics stores separately, and this row includes pharmacies, so it errs low.
 * Any category not listed falls back to all retail stores.
 */
export const CATEGORY_STORE_TYPE: Record<string, keyof typeof STORE_TYPES> = {
  beauty: "healthPersonalCare",
  hair: "healthPersonalCare",
  earplugs: "healthPersonalCare",
  "running-shoes": "shoe",
  "tech-accessories": "electronicsAppliance",
  gadgets: "electronicsAppliance",
  "wireless-earbuds": "electronicsAppliance",
  "espresso-machines": "electronicsAppliance",
  "house-plants": "buildingGarden",
};

export function storeTypeFor(category: string): StoreType {
  return STORE_TYPES[CATEGORY_STORE_TYPE[category] ?? "allRetail"];
}

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
