// AliExpress Open Platform adapter: the Drop Shipping API, which app 555220 is registered for.
// One search = one `aliexpress.ds.text.search` call, priced in the market's currency for delivery to
// it. Calls act for the owner's AliExpress account through an OAuth access token (see tokens.ts).
// Requests are signed with the app secret (HMAC-SHA256 over the sorted parameters, as the platform's
// SDK does); the secret, the token and the signature are never logged.

import type { QueryBudget } from "@/server/live/budget";
import { MARKETS, type Market } from "@/server/live/types";
import { SourceError, type SupplierSource } from "../types";
import { aliexpressError, parseTextSearch, tokenRejected, type TextSearchResponse } from "./parse";
import { signParams } from "./sign";
import type { TokenKeeper } from "./tokens";

export { signParams } from "./sign";

const GATEWAY = "https://api-sg.aliexpress.com/sync";
const METHOD = "aliexpress.ds.text.search";
const LOCALE: Record<Market, string> = { US: "en_US", GB: "en_GB" };
const PAGE_SIZE = "20";
const MAX_CALL_MS = 15_000;

export function createAliexpressSource({
  appKey,
  appSecret,
  tokens,
  fetchImpl = fetch,
  now = () => new Date(),
}: {
  appKey: string;
  appSecret: string;
  tokens: TokenKeeper;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): SupplierSource {
  return {
    name: "aliexpress",
    async search(term: string, shipTo: Market, budget: QueryBudget) {
      budget.spendCall();
      // Renewing the token, when it's due, is account upkeep rather than a search: it isn't budgeted.
      const accessToken = await tokens.accessToken();
      const params: Record<string, string> = {
        app_key: appKey,
        method: METHOD,
        timestamp: String(now().getTime()),
        sign_method: "sha256",
        access_token: accessToken,
        keyWord: term,
        local: LOCALE[shipTo],
        countryCode: shipTo, // ISO country code: US, GB
        currency: MARKETS[shipTo].currency, // prices come back in the market's currency
        pageSize: PAGE_SIZE,
        pageIndex: "1",
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
      const json = (await res.json().catch(() => null)) as TextSearchResponse | null;
      if (json && tokenRejected(json)) tokens.invalidate();
      const error = json ? aliexpressError(json) : `HTTP ${res.status}`;
      if (!res.ok || !json || error) throw new SourceError("aliexpress", error ?? `HTTP ${res.status}`);
      return parseTextSearch(json, shipTo, now());
    },
  };
}
