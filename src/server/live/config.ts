// Which data sources live search runs with, from the environment. Live search is only
// "ready" when every source it needs is configured; until then the API says so up front.

import { env } from "@/lib/env";
import { createRainforestSource } from "@/server/sources/rainforest";
import type { RetailSource, SupplierSource } from "@/server/sources/types";

export type LiveSources = { retail: RetailSource; supplier: SupplierSource };

export function liveSources(): { ready: true; sources: LiveSources } | { ready: false; missing: string[] } {
  const missing: string[] = [];
  const retail = env.RAINFOREST_API_KEY ? createRainforestSource({ apiKey: env.RAINFOREST_API_KEY }) : null;
  if (!retail) missing.push("retail source: RAINFOREST_API_KEY is not set");
  // The AliExpress provider is still to be chosen (ROADMAP.md, decision 1).
  const supplier: SupplierSource | null = null;
  if (!supplier) missing.push("supplier source: no AliExpress provider is connected yet");
  return retail && supplier ? { ready: true, sources: { retail, supplier } } : { ready: false, missing };
}
