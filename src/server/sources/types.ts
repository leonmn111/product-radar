// The interface every data provider adapter implements (one folder per provider, AGENTS.md).
// The engine never sees a provider's SDK or response shapes: only listings with evidence.

import type { QueryBudget } from "@/server/live/budget";
import type { Market, RetailListing, RetailProductDetail, SupplierOffer } from "@/server/live/types";

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

/** A provider answered, but not usefully (bad key, quota, outage). Never retried within a query. */
export class SourceError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(`${provider}: ${message}`);
  }
}
