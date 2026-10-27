// Meta Ad Library API (`/ads_archive`) response → observed ads with evidence. Pure: no network.
// Field names follow Meta's ArchivedAd reference (developers.facebook.com/docs/marketing-api/reference/
// archived-ad). UNVERIFIED against a live response until the first real call: the fixture in the tests
// is the documented shape, not a recording.
//
// `ad_snapshot_url` is never read: Meta puts the caller's access token in it. Each ad is cited by its
// public Ad Library page instead.

import type { ObservedAd } from "@/server/live/types";

// The Meta Ad Library's own API: official, but the schedule is what the advertiser entered.
export const META_AD_LIBRARY_QUALITY = 80;

export const AD_FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "publisher_platforms",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "eu_total_reach",
] as const;

type ArchivedAd = {
  id?: unknown;
  page_id?: unknown;
  page_name?: unknown;
  ad_delivery_start_time?: unknown;
  ad_delivery_stop_time?: unknown;
  publisher_platforms?: unknown;
  ad_creative_bodies?: unknown;
  ad_creative_link_titles?: unknown;
  eu_total_reach?: unknown;
};

export type AdsArchiveResponse = {
  data?: ArchivedAd[];
  paging?: { cursors?: { after?: string }; next?: string };
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : []);
const iso = (v: unknown) => {
  const s = str(v);
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** The public page for one ad in the Ad Library: what a reader can open. */
export const adLibraryUrl = (id: string) => `https://www.facebook.com/ads/library/?id=${id}`;

/** Meta's error, or null when the response is a success. */
export function metaError(json: AdsArchiveResponse | null): { code: number | null; subcode: number | null; message: string } | null {
  if (!json?.error) return null;
  return { code: json.error.code ?? null, subcode: json.error.error_subcode ?? null, message: json.error.message ?? json.error.type ?? "error" };
}

/** Throttling (graph-api/overview/rate-limiting): 4 app, 17 user, 32 pages, 613 custom, 80000-series business use case. */
export const isThrottle = (code: number | null) => code !== null && (code === 4 || code === 17 || code === 32 || code === 613 || (code >= 80000 && code < 81000));

/** The token was refused (expired, revoked or malformed). */
export const isTokenRejected = (code: number | null) => code === 190;

export function parseAdsArchive(json: AdsArchiveResponse, observedAt: Date): ObservedAd[] {
  const ads: ObservedAd[] = [];
  for (const a of json.data ?? []) {
    const id = str(a.id);
    const pageId = str(a.page_id);
    if (!id || !/^\d+$/.test(id) || !pageId) continue;
    const pageName = str(a.page_name) ?? "an unnamed page";
    const startedAt = iso(a.ad_delivery_start_time);
    const platforms = strings(a.publisher_platforms).map((p) => p.toUpperCase());
    const reach = Number(a.eu_total_reach);
    const text = [...strings(a.ad_creative_bodies), ...strings(a.ad_creative_link_titles)].join(" \n ");
    const where = platforms.length ? ` on ${platforms.map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(", ")}` : "";
    ads.push({
      id,
      pageId,
      pageName,
      startedAt,
      stoppedAt: iso(a.ad_delivery_stop_time),
      platforms,
      text,
      euReach: Number.isFinite(reach) && reach >= 0 ? Math.round(reach) : null,
      evidence: {
        id: `meta_ad_library:${id}`,
        provider: "meta_ad_library",
        sourceUrl: adLibraryUrl(id),
        observedAt: observedAt.toISOString(),
        quality: META_AD_LIBRARY_QUALITY,
        claim: `Active ad by "${pageName}"${where}${startedAt ? `, scheduled from ${startedAt.slice(0, 10)}` : ""}`,
      },
    });
  }
  return ads;
}

/** The next page's URL, only if it stays on Meta's Graph API host. */
export function nextPage(json: AdsArchiveResponse): string | null {
  const next = json.paging?.next;
  if (!next || !(json.data?.length ?? 0)) return null;
  try {
    return new URL(next).hostname === "graph.facebook.com" ? next : null;
  } catch {
    return null;
  }
}
