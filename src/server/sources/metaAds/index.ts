// Meta Ad Library: the real connector is library.ts (createMetaAdLibrarySource), used by the Viral
// Demand Engine (src/services/metaAds.ts). What stays here is the SIMULATED longest-running-ad source:
// fetchLongestRunningAd() is a random 0–120 days that looks at nothing, so it may only ever touch
// development sample data (CLAUDE.md Rule 3); the Dossier service refuses it for anything else.
//
// The Ad Library API is free but needs an access token from an identity-confirmed Meta account. It
// returns commercial ads only when they reached an EU country (a UK-only ad isn't in it);
// ad_delivery_start_time is when the advertiser scheduled the ad to start.

export { AdLibraryRateLimitedError, createMetaAdLibrarySource } from "./library";
export { AD_DATA_PENDING, adLibraryTokenPending } from "./token";

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
