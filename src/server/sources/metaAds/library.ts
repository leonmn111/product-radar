// Meta Ad Library API adapter: the active ads that match a search, for the Viral Demand Engine
// (src/services/metaAds.ts). Free, read-only (`GET /<version>/ads_archive`), with a user access token
// from an identity-confirmed Meta developer account. The token travels in the Authorization header, so
// it never appears in a URL or a log.
//
// Coverage (Meta's ads_archive reference): commercial ads are returned only when they reached an EU
// country; ads that reached no EU location come back only if they're about social issues, elections or
// politics. A UK-only product ad is therefore invisible here, and every result says so.
//
// Rate limits (graph-api/overview/rate-limiting): the app may make 200 calls an hour per user, on a
// rolling hour, and reports its use in the X-App-Usage header as percentages. This adapter:
//   - spends one call from the query's budget per page, each with its own timeout;
//   - stops paging once any X-App-Usage figure reaches USAGE_HEADROOM_PCT, returning what it has as
//     truncated (lower-bound counts) rather than risking the limit;
//   - on a throttling error stops calling altogether until Meta says access is back (the business
//     use case header), or for an hour: Meta warns that calling on while throttled extends the block.
// UNVERIFIED until the first real call: the Bearer header, the JSON-array form of
// ad_reached_countries and the page size are Graph API conventions this endpoint's page doesn't spell out.

import { BudgetExceededError, type QueryBudget } from "@/server/live/budget";
import type { ObservedAd } from "@/server/live/types";
import { SourceError, type AdLibrarySource, type AdSearch, type AdSearchResult } from "../types";
import { AD_FIELDS, isThrottle, isTokenRejected, metaError, nextPage, parseAdsArchive, type AdsArchiveResponse } from "./parse";

export const AD_LIBRARY_API_VERSION = "v26.0";
const GRAPH = "https://graph.facebook.com";
const PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 3;
const MAX_CALL_MS = 15_000;
export const USAGE_HEADROOM_PCT = 80;
const DEFAULT_PAUSE_MS = 60 * 60 * 1000; // the rolling hour

/** Throttled by Meta: no calls until `retryAt`. Never read as "no ads". */
export class AdLibraryRateLimitedError extends SourceError {
  constructor(readonly retryAt: Date) {
    super("meta_ad_library", `rate limited until ${retryAt.toISOString()}`);
  }
}

/** The highest X-App-Usage percentage (calls, CPU time or total time), or null without the header. */
export function appUsagePct(headers: Headers): number | null {
  try {
    const u = JSON.parse(headers.get("x-app-usage") ?? "null") as Record<string, number> | null;
    if (!u) return null;
    const pcts = [u.call_count, u.total_cputime, u.total_time].filter((n) => typeof n === "number");
    return pcts.length ? Math.max(...pcts) : null;
  } catch {
    return null;
  }
}

/** How long Meta says access is blocked (X-Business-Use-Case-Usage, in minutes), else the rolling hour. */
export function pauseMs(headers: Headers): number {
  try {
    const buc = JSON.parse(headers.get("x-business-use-case-usage") ?? "null") as Record<string, { estimated_time_to_regain_access?: number }[]> | null;
    const minutes = Object.values(buc ?? {})
      .flat()
      .map((u) => u.estimated_time_to_regain_access ?? 0);
    const longest = Math.max(0, ...minutes);
    return longest > 0 ? longest * 60_000 : DEFAULT_PAUSE_MS;
  } catch {
    return DEFAULT_PAUSE_MS;
  }
}

export function createMetaAdLibrarySource({
  accessToken,
  fetchImpl = fetch,
  now = () => new Date(),
  apiVersion = AD_LIBRARY_API_VERSION,
}: {
  accessToken: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  apiVersion?: string;
}): AdLibrarySource {
  // One pause per source (the config keeps one per process): every search waits it out together.
  let pausedUntil = 0;

  return {
    name: "meta_ad_library",
    async activeAds(search: AdSearch, budget: QueryBudget): Promise<AdSearchResult> {
      if (now().getTime() < pausedUntil) throw new AdLibraryRateLimitedError(new Date(pausedUntil));
      const terms = search.terms.trim().slice(0, 100);
      if (!terms) throw new RangeError("search terms are required");
      const params = new URLSearchParams({
        search_terms: terms,
        search_type: search.exactPhrase ? "KEYWORD_EXACT_PHRASE" : "KEYWORD_UNORDERED",
        ad_type: "ALL",
        ad_active_status: "ACTIVE",
        ad_reached_countries: JSON.stringify(search.countries),
        fields: AD_FIELDS.join(","),
        limit: String(PAGE_SIZE),
      });
      const maxPages = search.maxPages ?? DEFAULT_MAX_PAGES;
      const ads: ObservedAd[] = [];
      let url: string | null = `${GRAPH}/${apiVersion}/ads_archive?${params}`;
      let pages = 0;

      while (url) {
        if (pages >= maxPages) return { ads, truncated: true, stoppedBecause: "page_limit" };
        try {
          budget.spendCall();
        } catch (e) {
          // Out of budget after at least one page: what we have is a lower bound, and says so.
          if (pages > 0 && e instanceof BudgetExceededError) return { ads, truncated: true, stoppedBecause: "budget" };
          throw e;
        }
        let res: Response;
        try {
          res = await fetchImpl(url, {
            headers: { authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(Math.min(MAX_CALL_MS, budget.remainingMs())),
          });
        } catch (e) {
          throw new SourceError("meta_ad_library", e instanceof Error && e.name === "TimeoutError" ? "timed out" : "network error");
        }
        pages++;
        const json = (await res.json().catch(() => null)) as AdsArchiveResponse | null;
        const error = metaError(json);
        if (error && isThrottle(error.code)) {
          pausedUntil = now().getTime() + pauseMs(res.headers);
          throw new AdLibraryRateLimitedError(new Date(pausedUntil));
        }
        if (error && isTokenRejected(error.code)) throw new SourceError("meta_ad_library", "the access token was refused (expired or revoked)");
        if (!res.ok || !json || error) throw new SourceError("meta_ad_library", error ? `error ${error.code ?? "?"}` : `HTTP ${res.status}`);

        ads.push(...parseAdsArchive(json, now()));
        url = nextPage(json);
        const usage = appUsagePct(res.headers);
        if (url && usage !== null && usage >= USAGE_HEADROOM_PCT) return { ads, truncated: true, stoppedBecause: "rate_limit_headroom" };
      }
      return { ads, truncated: false, stoppedBecause: null };
    },
  };
}
