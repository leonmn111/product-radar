// The interface every data provider adapter implements (one folder per provider, AGENTS.md).
// The engine never sees a provider's SDK or response shapes: only listings with evidence.

import type { QueryBudget } from "@/server/live/budget";
import type { Market, ObservedAd, ProductHistory, RetailListing, RetailProductDetail, SupplierOffer } from "@/server/live/types";

export interface RetailSource {
  readonly name: string;
  /** Products for sale in one market that match the search term. Spends from the budget. */
  search(term: string, market: Market, budget: QueryBudget): Promise<RetailListing[]>;
  /** One product page by the marketplace's id (Amazon: ASIN); null when there's no such product. Spends from the budget. */
  product(id: string, market: Market, budget: QueryBudget): Promise<RetailProductDetail | null>;
}

export interface SupplierSource {
  readonly name: string;
  /** Supplier offers for the search term, priced for delivery to the market. Spends from the budget. */
  search(term: string, shipTo: Market, budget: QueryBudget): Promise<SupplierOffer[]>;
}

export interface HistorySource {
  readonly name: string;
  /** The last 90 days of sales rank and price for one product; null when the provider has none. Spends from the budget. */
  history(asin: string, budget: QueryBudget): Promise<ProductHistory | null>;
}

/** What to ask an ad library for. */
export type AdSearch = {
  terms: string; // up to 100 characters
  exactPhrase?: boolean; // a brand name, in order; otherwise every word, any order
  countries: string[]; // ISO codes the ads reached, e.g. ["GB", "DE"]
  maxPages?: number;
};

/** What came back. When `truncated`, the counts built on it are lower bounds, and say so. */
export type AdSearchResult = {
  ads: ObservedAd[];
  truncated: boolean;
  stoppedBecause: "page_limit" | "budget" | "rate_limit_headroom" | null;
};

export interface AdLibrarySource {
  readonly name: string;
  /** Active ads for the search, page by page until done or a limit is reached. Spends one call per page. */
  activeAds(search: AdSearch, budget: QueryBudget): Promise<AdSearchResult>;
}

/** A provider answered, but not usefully (bad key, quota, outage). Never retried within a query. */
export class SourceError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(`${provider}: ${message}`);
  }
}
