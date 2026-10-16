// Development sample sources for the live-search page: no provider calls, no cost. Retail is a
// REAL recorded Rainforest response (amazon.co.uk, "magnetic power bank", 2026-10-15); the
// AliExpress side is SAMPLE data until the affiliate account is approved. Only the recorded
// query has data; anything else returns nothing. Never used in production.

import type { QueryBudget } from "@/server/live/budget";
import type { Market } from "@/server/live/types";
import { parseProductQuery, type ProductQueryResponse } from "./aliexpress/parse";
import aliexpressGB from "./aliexpress/fixtures/sample-product-query-GB.json";
import aliexpressUS from "./aliexpress/fixtures/sample-product-query-US.json";
import recordedUK from "./rainforest/fixtures/search-amazon-co-uk-recorded.json";
import { parseRainforestSearch, type RainforestSearchResponse } from "./rainforest/parse";
import type { RetailSource, SupplierSource } from "./types";

export const SAMPLE_QUERY = "magnetic power bank";
const isSampleQuery = (term: string) => term.toLowerCase().includes("power bank");

export const sampleRetailSource: RetailSource = {
  name: "rainforest (recorded)",
  async search(term: string, market: Market, budget: QueryBudget) {
    budget.spendCall();
    // Only the UK search was recorded.
    if (market !== "GB" || !isSampleQuery(term)) return [];
    return parseRainforestSearch(recordedUK as RainforestSearchResponse, "GB", new Date());
  },
};

export const sampleSupplierSource: SupplierSource = {
  name: "aliexpress (sample)",
  async search(term: string, shipTo: Market, budget: QueryBudget) {
    budget.spendCall();
    if (!isSampleQuery(term)) return [];
    const offers = parseProductQuery((shipTo === "GB" ? aliexpressGB : aliexpressUS) as ProductQueryResponse, shipTo, new Date());
    return offers.map((o) => ({ ...o, evidence: { ...o.evidence, provider: "aliexpress (sample)" } }));
  },
};
