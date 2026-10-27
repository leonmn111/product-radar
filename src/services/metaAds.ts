// Viral Demand Engine (Phase 3): how hard advertisers are pushing a product right now, from the Meta
// Ad Library. A keyword or brand in; the active ads that really match it, how many are scaling, and the
// evidence behind every count out.
//
//   1. Search the Ad Library for the product's key words (live/match.ts), active ads only, that reached
//      the UK or the main EU markets. One budgeted call per page, cached for a day per search.
//   2. Keep only ads whose own words carry 80% of the product's key words: the strict rule supplier
//      matching uses, so a broad keyword search can't count unrelated ads.
//   3. Count (methodology 1.0.0, calculated estimates, CLAUDE.md Rule 4):
//        activeAds    matching ads running now
//        scalingAds   active ads that have run SCALING_MIN_DAYS or more (advertisers keep paying for
//                     what sells), or whose advertiser runs SCALING_MIN_VARIANTS or more matching ads at
//                     once (duplicating a winner to spend more)
//        newAds7d     matching ads scheduled to start in the last NEW_AD_DAYS days (launch velocity)
//        advertisers, longest-running and median ad age, and Meta's EU reach estimate where reported
//   4. Gate the numbers at 0.7 confidence over the ads' evidence (Rule 5): below it, withheld with
//      what's missing, never estimated. A failed or throttled search is never read as "no ads".
//
// Ad spend can't be measured: Meta publishes spend and impressions only for political and issue ads.
// "Momentum" is the change in these counts between snapshots of a watched product (adMomentumTrend),
// stored once the AdWatch / AdMomentumSnapshot tables exist (proposed, awaiting the owner's review).

import { calculateConfidence, FINANCIAL_THRESHOLD } from "@/engine/confidence";
import { QueryBudget } from "@/server/live/budget";
import { searchTermFor, SUPPLIER_MATCH_MIN, supplierMatchScore } from "@/server/live/match";
import type { ObservedAd } from "@/server/live/types";
import { AD_DATA_PENDING } from "@/server/sources/metaAds/token";
import type { AdLibrarySource } from "@/server/sources/types";
import type { Evidence, Gated } from "@/types/dossier";

export const AD_MOMENTUM_METHODOLOGY = "1.0.0";
export const SCALING_MIN_DAYS = 30;
export const SCALING_MIN_VARIANTS = 3;
export const NEW_AD_DAYS = 7;
/** The UK and the largest EU markets ProductRadar serves. Commercial ads show only if they reached the EU. */
export const DEFAULT_AD_COUNTRIES = ["GB", "IE", "DE", "FR", "ES", "IT", "NL"];
export const AD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export const AD_COVERAGE_NOTE =
  "From the Meta Ad Library, which lists product ads only when they reached the EU: ads shown only in the UK aren't counted. Meta doesn't publish spend for product ads.";

export type AdMomentum = {
  term: string;
  countries: string[];
  activeAds: number;
  scalingAds: number;
  advertisers: number;
  newAds7d: number;
  longestRunningDays: number | null;
  medianAgeDays: number | null;
  euReach: number | null; // sum of Meta's EU reach estimates, where reported
  truncated: boolean; // the search stopped early (pages, budget or rate-limit headroom): counts are lower bounds
  observedAt: string;
  methodologyVersion: string;
};

/** What one search saw: the counts, the matching ads, and which of them are scaling. */
export type AdObservationSummary = { momentum: AdMomentum; matched: ObservedAd[]; scalingIds: string[] };

export type AdMomentumResult = {
  momentum: Gated<AdMomentum>;
  evidence: Evidence[];
  coverage: string;
  /** True while the Meta token is missing or a placeholder: "Ad data pending Meta approval". */
  pending: boolean;
  /** What the search saw, whatever the gate says: what a snapshot stores. Null when nothing was searched. */
  observation: AdObservationSummary | null;
};

/** What the Ad Library is searched for: the product's key words, or a brand as an exact phrase. */
export function adSearchFor(keywordOrBrand: string, { brand = false } = {}) {
  const terms = brand ? keywordOrBrand.trim().slice(0, 100) : searchTermFor(keywordOrBrand);
  return { terms, exactPhrase: brand };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/** The counts, from the ads a search returned. Pure. */
export function summariseAdMomentum(
  term: string,
  countries: string[],
  ads: ObservedAd[],
  { now, truncated, brand = false }: { now: Date; truncated: boolean; brand?: boolean },
): AdObservationSummary {
  // A brand search is already an exact phrase; a keyword search must match the ad's own words.
  const matched = brand ? ads : ads.filter((a) => supplierMatchScore(term, a.text) >= SUPPLIER_MATCH_MIN);
  const ageDays = (a: ObservedAd) => (a.startedAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(a.startedAt)) / DAY_MS)) : null);
  const perPage = new Map<string, number>();
  for (const a of matched) perPage.set(a.pageId, (perPage.get(a.pageId) ?? 0) + 1);
  const ages = matched.map(ageDays).filter((d): d is number => d !== null);
  const reach = matched.map((a) => a.euReach).filter((r): r is number => r !== null);
  const scaling = matched.filter((a) => (ageDays(a) ?? 0) >= SCALING_MIN_DAYS || (perPage.get(a.pageId) ?? 0) >= SCALING_MIN_VARIANTS);
  return {
    matched,
    scalingIds: scaling.map((a) => a.id),
    momentum: {
      term,
      countries,
      activeAds: matched.length,
      scalingAds: scaling.length,
      advertisers: perPage.size,
      newAds7d: ages.filter((d) => d < NEW_AD_DAYS).length,
      longestRunningDays: ages.length ? Math.max(...ages) : null,
      medianAgeDays: ages.length ? median(ages) : null,
      euReach: reach.length ? reach.reduce((a, b) => a + b, 0) : null,
      truncated,
      observedAt: now.toISOString(),
      methodologyVersion: AD_MOMENTUM_METHODOLOGY,
    },
  };
}

/** Rising, flat or falling: the change in active matching ads between two snapshots of one watch. */
export function adMomentumTrend(previous: Pick<AdMomentum, "activeAds" | "observedAt">, current: Pick<AdMomentum, "activeAds" | "observedAt">) {
  const days = Math.max(1, Math.round((Date.parse(current.observedAt) - Date.parse(previous.observedAt)) / DAY_MS));
  if (previous.activeAds === 0) return { direction: current.activeAds > 0 ? ("RISING" as const) : ("FLAT" as const), changePct: null, days };
  const changePct = Math.round(((current.activeAds - previous.activeAds) / previous.activeAds) * 1000) / 10;
  return { direction: changePct >= 10 ? ("RISING" as const) : changePct <= -10 ? ("FALLING" as const) : ("FLAT" as const), changePct, days };
}

// ── Fetching (the only I/O) ──────────────────────────────────────────────────

export interface AdSearchCache {
  get(key: string, now: Date): { ads: ObservedAd[]; truncated: boolean; at: Date } | null;
  put(key: string, value: { ads: ObservedAd[]; truncated: boolean }, now: Date): void;
}

/** Searches in this process's memory for a day (the AdMomentumSnapshot table replaces it once approved). */
export function memoryAdSearchCache(ttlMs = AD_CACHE_TTL_MS, max = 500): AdSearchCache {
  const rows = new Map<string, { ads: ObservedAd[]; truncated: boolean; at: number }>();
  return {
    get(key, now) {
      const r = rows.get(key);
      return r && now.getTime() - r.at < ttlMs ? { ads: r.ads, truncated: r.truncated, at: new Date(r.at) } : null;
    },
    put(key, value, now) {
      rows.delete(key);
      rows.set(key, { ...value, at: now.getTime() });
      if (rows.size > max) rows.delete(rows.keys().next().value!);
    },
  };
}

const sharedCache = memoryAdSearchCache();

export type AdMomentumDeps = {
  /** The live Ad Library; null while the access token is missing or a placeholder (liveAdLibrarySource). */
  source: AdLibrarySource | null;
  countries?: string[];
  cache?: AdSearchCache;
  now?: () => Date;
  budget?: () => QueryBudget;
};

const withheld = (confidence: number, missing: string[]): Gated<AdMomentum> => ({ status: "withheld", reason: "Insufficient Data", confidence, missing });

/**
 * A product's ad momentum now. Calls the Ad Library at most once per search a day (a few pages);
 * a failure, including Meta throttling, is withheld with the reason, never counted as zero ads.
 */
export async function getAdMomentum(keywordOrBrand: string, deps: AdMomentumDeps, { brand = false } = {}): Promise<AdMomentumResult> {
  const now = deps.now ?? (() => new Date());
  const countries = deps.countries ?? DEFAULT_AD_COUNTRIES;
  const search = adSearchFor(keywordOrBrand, { brand });
  const result = (momentum: Gated<AdMomentum>, evidence: Evidence[] = [], observation: AdMomentumResult["observation"] = null, pending = false): AdMomentumResult => ({
    momentum,
    evidence,
    coverage: AD_COVERAGE_NOTE,
    pending,
    observation,
  });
  if (!search.terms) return result(withheld(0, ["a product keyword or brand to search for"]));
  if (!deps.source) return result(withheld(0, [AD_DATA_PENDING]), [], null, true);

  const cache = deps.cache ?? sharedCache;
  const key = JSON.stringify([search.terms, search.exactPhrase, [...countries].sort()]);
  let found = cache.get(key, now());
  if (!found) {
    try {
      const budget = deps.budget?.() ?? new QueryBudget({ maxCalls: 3, deadlineMs: 30_000 });
      const res = await deps.source.activeAds({ ...search, countries }, budget);
      cache.put(key, res, now());
      found = { ads: res.ads, truncated: res.truncated, at: now() };
    } catch (e) {
      console.error("[meta-ads] Ad Library search failed", e);
      return result(withheld(0, ["live Meta Ad Library data: the search failed just now, so nothing is counted. Try again later."]));
    }
  }

  const observation = summariseAdMomentum(search.terms, countries, found.ads, { now: found.at, truncated: found.truncated, brand });
  const { momentum, matched } = observation;
  const evidence: Evidence[] = matched.map((a) => ({ ...a.evidence, sourceType: "ads_library", publishedAt: null, value: a.startedAt }));
  const confidence = calculateConfidence(evidence, now());
  if (matched.length === 0) {
    return result(withheld(confidence, [`active ads that match "${search.terms}" (none visible in the Ad Library's EU-delivered ads)`]), evidence, observation);
  }
  if (confidence < FINANCIAL_THRESHOLD) return result(withheld(confidence, [`more matching active ads (${matched.length} found)`]), evidence, observation);
  return result({ status: "shown", confidence, value: momentum, evidenceIds: evidence.map((e) => e.id) }, evidence, observation);
}
