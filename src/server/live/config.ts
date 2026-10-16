// Which data sources live search runs with, from the environment. Live search is only
// "ready" when every source it needs is configured; until then callers are told up front.
// Sample mode is development-only (refused in production): the live-search page and, locally, the
// paid API can run on it, and every result says it's sample data.

import { env } from "@/lib/env";
import { createAliexpressSource } from "@/server/sources/aliexpress";
import { createKeepaSource } from "@/server/sources/keepa";
import { simulatedAdSource, type AdDurationSource } from "@/server/sources/metaAds";
import { createRainforestSource } from "@/server/sources/rainforest";
import { sampleHistorySource, sampleRetailSource, sampleSupplierSource } from "@/server/sources/sample";
import type { HistorySource, RetailSource, SupplierSource } from "@/server/sources/types";

/**
 * Retail and supplier sources are required. History (Keepa) and ad duration (Meta Ad Library) are
 * optional: without them Momentum is withheld and names what's missing. Ad duration is only ever the
 * simulated source, in sample mode, until the real connector exists.
 */
export type LiveSources = { retail: RetailSource; supplier: SupplierSource; history?: HistorySource | null; ads?: AdDurationSource | null };
export type LiveSourcesStatus = { ready: true; sample: boolean; sources: LiveSources } | { ready: false; missing: string[] };

/** True when development sample mode is switched on (never in production). */
export const sampleModeOn = () => env.LIVE_SAMPLE_DATA === "on" && env.NODE_ENV !== "production";

export function liveSources({ allowSample = false }: { allowSample?: boolean } = {}): LiveSourcesStatus {
  if (allowSample && sampleModeOn()) {
    return {
      ready: true,
      sample: true,
      sources: { retail: sampleRetailSource, supplier: sampleSupplierSource, history: sampleHistorySource, ads: simulatedAdSource },
    };
  }
  const missing: string[] = [];
  const retail = env.RAINFOREST_API_KEY ? createRainforestSource({ apiKey: env.RAINFOREST_API_KEY }) : null;
  if (!retail) missing.push("retail source: RAINFOREST_API_KEY is not set");
  const { ALIEXPRESS_APP_KEY: appKey, ALIEXPRESS_APP_SECRET: appSecret, ALIEXPRESS_TRACKING_ID: trackingId } = env;
  const supplier = appKey && appSecret && trackingId ? createAliexpressSource({ appKey, appSecret, trackingId }) : null;
  if (!supplier) missing.push("supplier source: the AliExpress affiliate API isn't connected yet (ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID)");
  const history = env.KEEPA_API_KEY ? createKeepaSource({ apiKey: env.KEEPA_API_KEY }) : null;
  return retail && supplier ? { ready: true, sample: false, sources: { retail, supplier, history } } : { ready: false, missing };
}

export type RetailSourceStatus = { ready: true; sample: boolean; retail: RetailSource } | { ready: false; missing: string[] };

/** Just the retail source (Amazon UK listings), for searches that don't need suppliers. */
export function liveRetailSource({ allowSample = false }: { allowSample?: boolean } = {}): RetailSourceStatus {
  if (allowSample && sampleModeOn()) return { ready: true, sample: true, retail: sampleRetailSource };
  if (!env.RAINFOREST_API_KEY) return { ready: false, missing: ["retail source: RAINFOREST_API_KEY is not set"] };
  return { ready: true, sample: false, retail: createRainforestSource({ apiKey: env.RAINFOREST_API_KEY }) };
}
