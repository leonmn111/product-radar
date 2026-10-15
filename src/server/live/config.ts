// Which data sources live search runs with, from the environment. Live search is only
// "ready" when every source it needs is configured; until then callers are told up front.
// The paid API uses real sources only. The development-only sample mode is for the site's
// live-search page and is flagged on every result.

import { env } from "@/lib/env";
import { createAliexpressSource } from "@/server/sources/aliexpress";
import { createRainforestSource } from "@/server/sources/rainforest";
import { sampleRetailSource, sampleSupplierSource } from "@/server/sources/sample";
import type { RetailSource, SupplierSource } from "@/server/sources/types";

export type LiveSources = { retail: RetailSource; supplier: SupplierSource };
export type LiveSourcesStatus = { ready: true; sample: boolean; sources: LiveSources } | { ready: false; missing: string[] };

/** True when development sample mode is switched on (never in production). */
export const sampleModeOn = () => env.LIVE_SAMPLE_DATA === "on" && env.NODE_ENV !== "production";

export function liveSources({ allowSample = false }: { allowSample?: boolean } = {}): LiveSourcesStatus {
  if (allowSample && sampleModeOn()) {
    return { ready: true, sample: true, sources: { retail: sampleRetailSource, supplier: sampleSupplierSource } };
  }
  const missing: string[] = [];
  const retail = env.RAINFOREST_API_KEY ? createRainforestSource({ apiKey: env.RAINFOREST_API_KEY }) : null;
  if (!retail) missing.push("retail source: RAINFOREST_API_KEY is not set");
  const { ALIEXPRESS_APP_KEY: appKey, ALIEXPRESS_APP_SECRET: appSecret, ALIEXPRESS_TRACKING_ID: trackingId } = env;
  const supplier = appKey && appSecret && trackingId ? createAliexpressSource({ appKey, appSecret, trackingId }) : null;
  if (!supplier) missing.push("supplier source: the AliExpress affiliate API isn't connected yet (ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID)");
  return retail && supplier ? { ready: true, sample: false, sources: { retail, supplier } } : { ready: false, missing };
}
