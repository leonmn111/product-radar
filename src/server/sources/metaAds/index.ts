// Meta Ad Library (ads_archive) adapter: how long the longest-running active ad for a product has run,
// a Momentum signal. Phase 2. SCAFFOLD: fetchLongestRunningAd() is SIMULATED, a random 0–120 days
// that looks at nothing, so it may only ever touch development sample data (CLAUDE.md Rule 3); the
// Dossier service refuses it for anything else, and real Dossiers show "no ad data" until it's real.
//
// For the real connector: the Ad Library API is free but needs an access token from an
// identity-confirmed Meta account. It covers commercial ads delivered to EU and UK users (kept for a
// year); ad_delivery_start_time is when the advertiser scheduled the ad to start. White-label
// products often have no brand, so the search will be by keyword as well as by page.

export const SIMULATED_AD_DAYS = { min: 0, max: 120 } as const;

export interface AdDurationSource {
  readonly method: "simulated";
  /** Days the longest-running active ad has been running; null when there's none. */
  longestRunningAdDays(brandOrKeyword: string): Promise<number | null>;
}

/** SIMULATED: a random whole number of days, 0 to 120. Throws for an empty brand. */
export function fetchLongestRunningAd(brandName: string): number {
  if (!brandName.trim()) throw new RangeError("brandName is required");
  const { min, max } = SIMULATED_AD_DAYS;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** The simulated source: development sample data only. */
export const simulatedAdSource: AdDurationSource = {
  method: "simulated",
  longestRunningAdDays: async (brand) => fetchLongestRunningAd(brand),
};
