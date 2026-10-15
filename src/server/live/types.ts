// Shared types for the live search engine (v2, ARCHITECTURE.md). Every value a source
// returns travels with the evidence that proves it (CLAUDE.md Rule 3).

export type Market = "US" | "GB";

export const MARKETS: Record<Market, { label: string; amazonDomain: string; currency: "USD" | "GBP" }> = {
  US: { label: "Amazon US", amazonDomain: "amazon.com", currency: "USD" },
  GB: { label: "Amazon UK", amazonDomain: "amazon.co.uk", currency: "GBP" },
};

export type Money = { amount: number; currency: string };

/** One sourced fact: where it came from, when, and how much it can be trusted (0–100). */
export type Evidence = {
  id: string; // stable per source item, e.g. "rainforest:amazon.com:B0029JFOVK"
  provider: string; // e.g. "rainforest"
  sourceUrl: string; // the page a reader can open
  observedAt: string; // ISO time the provider read it
  quality: number; // 0–100, by how the provider obtained it
  claim: string; // the fact, in words
};

/** A product for sale in a retail market. */
export type RetailListing = {
  market: Market;
  id: string; // the marketplace's own id (Amazon: ASIN)
  title: string;
  url: string;
  image: string | null;
  price: Money;
  rating: number | null; // out of 5
  ratingsTotal: number | null;
  sponsored: boolean;
  recentSales: string | null; // the marketplace's own words, e.g. "1K+ bought in past month"
  evidence: Evidence;
};

/** A supplier's offer, as delivered to a market. */
export type SupplierOffer = {
  id: string;
  title: string;
  url: string;
  image: string | null;
  unitPrice: Money;
  shipping: Money | null; // null = the source didn't quote shipping to this market
  shipsTo: Market;
  evidence: Evidence;
};
