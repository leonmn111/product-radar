// Rainforest API adapter (Amazon US + UK). One search or one product page = one Rainforest request = 1 credit.
// The API key travels in the query string, so request URLs are never logged.

import type { QueryBudget } from "@/server/live/budget";
import { MARKETS, type Market } from "@/server/live/types";
import { SourceError, type RetailSource } from "../types";
import { parseRainforestProduct, parseRainforestSearch, type RainforestProductResponse, type RainforestSearchResponse } from "./parse";

const ENDPOINT = "https://api.rainforestapi.com/request";
const MAX_CALL_MS = 25_000; // Rainforest's own example took ~11 s

export function createRainforestSource({
  apiKey,
  fetchImpl = fetch,
  now = () => new Date(),
}: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): RetailSource {
  /** One Rainforest request; throws SourceError when it fails or Rainforest says it failed. */
  async function request<T extends { request_info?: { success?: boolean; message?: string } }>(params: Record<string, string>, budget: QueryBudget): Promise<T> {
    budget.spendCall();
    const query = new URLSearchParams({ api_key: apiKey, ...params });
    let res: Response;
    try {
      res = await fetchImpl(`${ENDPOINT}?${query}`, { signal: AbortSignal.timeout(Math.min(MAX_CALL_MS, budget.remainingMs())) });
    } catch (e) {
      throw new SourceError("rainforest", e instanceof Error && e.name === "TimeoutError" ? "timed out" : "network error");
    }
    const json = (await res.json().catch(() => null)) as T | null;
    if (!res.ok || !json || json.request_info?.success === false) {
      throw new SourceError("rainforest", json?.request_info?.message ?? `HTTP ${res.status}`);
    }
    return json;
  }

  return {
    name: "rainforest",
    async search(term: string, market: Market, budget: QueryBudget) {
      const json = await request<RainforestSearchResponse>({ type: "search", amazon_domain: MARKETS[market].amazonDomain, search_term: term }, budget);
      return parseRainforestSearch(json, market, now());
    },
    async product(id: string, market: Market, budget: QueryBudget) {
      const json = await request<RainforestProductResponse>({ type: "product", amazon_domain: MARKETS[market].amazonDomain, asin: id }, budget);
      return parseRainforestProduct(json, market, now());
    },
  };
}
