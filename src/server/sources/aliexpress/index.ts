// AliExpress Open Platform adapter (official affiliate API). One search = one API call.
// Requests are signed with the app secret (HMAC-SHA256 over the sorted parameters, as the
// platform's SDK does); the secret and signature are never logged.
// UNVERIFIED against the live API until the affiliate account is approved (ROADMAP.md).

import { createHmac } from "node:crypto";
import type { QueryBudget } from "@/server/live/budget";
import { MARKETS, type Market } from "@/server/live/types";
import { SourceError, type SupplierSource } from "../types";
import { aliexpressError, parseProductQuery, type ProductQueryResponse } from "./parse";

const GATEWAY = "https://api-sg.aliexpress.com/sync";
const METHOD = "aliexpress.affiliate.product.query";
const MAX_CALL_MS = 15_000;

/** The platform's request signature: HMAC-SHA256(secret, k1v1k2v2… sorted by key), upper-case hex. */
export function signParams(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  return createHmac("sha256", secret).update(base, "utf8").digest("hex").toUpperCase();
}

export function createAliexpressSource({
  appKey,
  appSecret,
  trackingId,
  fetchImpl = fetch,
  now = () => new Date(),
}: {
  appKey: string;
  appSecret: string;
  trackingId: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): SupplierSource {
  return {
    name: "aliexpress",
    async search(term: string, shipTo: Market, budget: QueryBudget) {
      budget.spendCall();
      const params: Record<string, string> = {
        app_key: appKey,
        method: METHOD,
        timestamp: String(now().getTime()),
        sign_method: "sha256",
        keywords: term,
        ship_to_country: shipTo, // ISO country code: US, GB
        target_currency: MARKETS[shipTo].currency, // prices come back in the market's currency
        target_language: "EN",
        page_size: "20",
        tracking_id: trackingId,
      };
      const body = new URLSearchParams({ ...params, sign: signParams(params, appSecret) });
      let res: Response;
      try {
        res = await fetchImpl(GATEWAY, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
          body,
          signal: AbortSignal.timeout(Math.min(MAX_CALL_MS, budget.remainingMs())),
        });
      } catch (e) {
        throw new SourceError("aliexpress", e instanceof Error && e.name === "TimeoutError" ? "timed out" : "network error");
      }
      const json = (await res.json().catch(() => null)) as ProductQueryResponse | null;
      const error = json ? aliexpressError(json) : `HTTP ${res.status}`;
      if (!res.ok || !json || error) throw new SourceError("aliexpress", error ?? `HTTP ${res.status}`);
      return parseProductQuery(json, shipTo, now());
    },
  };
}
