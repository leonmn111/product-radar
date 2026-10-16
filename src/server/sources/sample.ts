// Development sample sources for the live-search page: no provider calls, no cost. Retail is
// REAL recorded Rainforest responses (amazon.co.uk: the "magnetic power bank" search, 2026-10-15,
// and the product page of B0CH33F5P2, 2026-10-16); the
// AliExpress side is SAMPLE data until the affiliate account is approved. Only the recorded
// query and product have data; anything else returns nothing. Keepa history is SAMPLE (made-up)
// data too, for the sample product. Never used in production.

import type { QueryBudget } from "@/server/live/budget";
import type { Market } from "@/server/live/types";
import { parseProductQuery, type ProductQueryResponse } from "./aliexpress/parse";
import aliexpressGB from "./aliexpress/fixtures/sample-product-query-GB.json";
import aliexpressUS from "./aliexpress/fixtures/sample-product-query-US.json";
import keepaSample from "./keepa/fixtures/SAMPLE-not-real-product-GB.json";
import { parseKeepaHistory } from "./keepa/index";
import type { KeepaProductResponse } from "./keepa/types";
import recordedProductUK from "./rainforest/fixtures/product-amazon-co-uk-B0CH33F5P2-recorded.json";
import recordedUK from "./rainforest/fixtures/search-amazon-co-uk-recorded.json";
import { parseRainforestProduct, parseRainforestSearch, type RainforestProductResponse, type RainforestSearchResponse } from "./rainforest/parse";
import type { HistorySource, RetailSource, SupplierSource } from "./types";

export const SAMPLE_QUERY = "magnetic power bank";
export const SAMPLE_ASIN = "B0CH33F5P2";
const isSampleQuery = (term: string) => term.toLowerCase().includes("power bank");

export const sampleRetailSource: RetailSource = {
  name: "rainforest (recorded)",
  async search(term: string, market: Market, budget: QueryBudget) {
    budget.spendCall();
    // Only the UK search was recorded.
    if (market !== "GB" || !isSampleQuery(term)) return [];
    return parseRainforestSearch(recordedUK as RainforestSearchResponse, "GB", new Date());
  },
  async product(id: string, market: Market, budget: QueryBudget) {
    budget.spendCall();
    if (market !== "GB" || id !== SAMPLE_ASIN) return null;
    return parseRainforestProduct(recordedProductUK as RainforestProductResponse, "GB", new Date());
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

/** SAMPLE (made-up) Keepa history, served for the sample product only. */
export const sampleHistorySource: HistorySource = {
  name: "keepa (sample)",
  async history(asin: string, budget: QueryBudget) {
    budget.spendCall();
    if (asin !== SAMPLE_ASIN) return null;
    const json = keepaSample as unknown as KeepaProductResponse;
    const rekeyed = { ...json, products: json.products?.map((p) => ({ ...p, asin })) };
    const h = parseKeepaHistory(rekeyed, asin, new Date(new Date(json.timestamp ?? Date.now()).getTime()));
    return h && { ...h, evidence: { ...h.evidence, provider: "keepa (sample)", claim: `SAMPLE, not real data: ${h.evidence.claim}` } };
  },
};
