// Ad Momentum storage (Phase 3): which products are watched on the Meta Ad Library (AdWatch), a dated
// snapshot of each check (AdMomentumSnapshot, appended, never overwritten) with every ad behind its counts
// (AdObservation), and, for catalog products, the AD_ACTIVE_ADS Evidence row the TREND score is
// calculated from (scoring v2.0.0, src/server/scoring/engine.ts). One snapshot per watch per UTC day.
//
// While the Meta token is pending (missing or a placeholder), nothing is searched or written: the run
// reports "Ad data pending Meta approval".

import { cleanTitle } from "@/components/dashboard/dossier";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { META_AD_LIBRARY_QUALITY } from "@/server/sources/metaAds/parse";
import { adSearchFor, DEFAULT_AD_COUNTRIES, getAdMomentum, type AdMomentum, type AdMomentumDeps, type AdObservationSummary } from "@/services/metaAds";

const CATALOG_PREFIX = "catalog:";
export const catalogKey = (productId: string) => `${CATALOG_PREFIX}${productId}`;
const catalogProductId = (productKey: string) => (productKey.startsWith(CATALOG_PREFIX) ? productKey.slice(CATALOG_PREFIX.length) : null);

/** A watch is due when it hasn't been checked in the last 20 hours (a daily run that drifts still catches it). */
export const WATCH_DUE_AFTER_MS = 20 * 60 * 60 * 1000;

export type Watch = { id: string; productKey: string; searchTerms: string; kind: "KEYWORD" | "BRAND"; countries: string[] };

/** The UTC day a snapshot describes. */
export const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** The Ad Library's own public search for the same terms: what an AD_ACTIVE_ADS evidence row cites. */
export function adLibrarySearchUrl(terms: string) {
  const q = new URLSearchParams({ active_status: "active", ad_type: "all", country: "ALL", q: terms, search_type: "keyword_unordered" });
  return `https://www.facebook.com/ads/library/?${q}`;
}

/** The snapshot row and its ads, from one check. Pure. */
export function snapshotData(watch: Watch, observation: AdObservationSummary, confidence: number) {
  const m = observation.momentum;
  const observedAt = new Date(m.observedAt);
  const scaling = new Set(observation.scalingIds); // the service's own scaling rule, not a copy of it
  return {
    watchId: watch.id,
    snapshotDate: utcDay(observedAt),
    observedAt,
    activeAds: m.activeAds,
    scalingAds: m.scalingAds,
    advertisers: m.advertisers,
    newAds7d: m.newAds7d,
    longestRunningDays: m.longestRunningDays,
    medianAgeDays: m.medianAgeDays,
    euReach: m.euReach === null ? null : BigInt(m.euReach),
    truncated: m.truncated,
    confidence: new Prisma.Decimal(Math.round(confidence * 1000) / 1000),
    methodologyVersion: m.methodologyVersion,
    ads: observation.matched.map((a) => ({
      libraryId: a.id,
      pageId: a.pageId,
      pageName: a.pageName,
      startedAt: a.startedAt ? new Date(a.startedAt) : null,
      platforms: a.platforms,
      euReach: a.euReach,
      scaling: scaling.has(a.id),
    })),
  };
}

/** The AD_ACTIVE_ADS evidence a catalog product's TREND score reads, from one snapshot. Pure. */
export function trendEvidenceData(productId: string, watch: Watch, m: AdMomentum) {
  const day = m.observedAt.slice(0, 10);
  const lowerBound = m.truncated ? "at least " : "";
  return {
    productId,
    claim:
      `${lowerBound}${m.activeAds} active Meta ad${m.activeAds === 1 ? "" : "s"} match "${watch.searchTerms}" (${m.scalingAds} scaling, ${m.newAds7d} new this week, ` +
      `${m.advertisers} advertiser${m.advertisers === 1 ? "" : "s"}), in the Meta Ad Library on ${day}. Ads shown only in the UK aren't listed there.`,
    sourceUrl: adLibrarySearchUrl(watch.searchTerms),
    sourceName: "Meta Ad Library",
    sourceType: "AD_LIBRARY" as const,
    observedAt: new Date(m.observedAt),
    // A search that stopped early only gives a lower bound, so it counts for less.
    qualityScore: new Prisma.Decimal(m.truncated ? 60 : META_AD_LIBRARY_QUALITY),
    metric: "AD_ACTIVE_ADS" as const,
    metricValue: new Prisma.Decimal(m.activeAds),
    contentHash: `ad-momentum:${watch.id}:${day}`, // one per watch and day, however often a run repeats
  };
}

/** Watches every live catalog product by its key words. Returns how many new watches were made. */
export async function watchCatalogProducts(db: PrismaClient): Promise<number> {
  const products = await db.product.findMany({
    where: { isSample: false },
    select: { id: true, name: true, offers: { select: { merchant: true }, take: 1 } },
  });
  const data = products
    .map((p) => ({ productKey: catalogKey(p.id), searchTerms: adSearchFor(cleanTitle(p.name, p.offers[0]?.merchant ?? null)).terms, countries: DEFAULT_AD_COUNTRIES }))
    .filter((w) => w.searchTerms.length > 0);
  const { count } = await db.adWatch.createMany({ data, skipDuplicates: true });
  return count;
}

export type RecordOutcome = "recorded" | "pending" | "failed" | "already_today";

/**
 * Checks one watch and stores what it saw. A failed search stores nothing (never zero ads); a second
 * check on the same UTC day is skipped. Returns the catalog product's category when its evidence changed.
 */
export async function recordAdSnapshot(db: PrismaClient, watch: Watch, deps: AdMomentumDeps): Promise<{ outcome: RecordOutcome; category: string | null }> {
  const now = deps.now ?? (() => new Date());
  const today = utcDay(now());
  if (await db.adMomentumSnapshot.findUnique({ where: { watchId_snapshotDate: { watchId: watch.id, snapshotDate: today } }, select: { id: true } })) {
    return { outcome: "already_today", category: null };
  }
  const result = await getAdMomentum(watch.searchTerms, { ...deps, countries: watch.countries }, { brand: watch.kind === "BRAND" });
  if (result.pending) return { outcome: "pending", category: null };
  if (!result.observation) return { outcome: "failed", category: null };

  const { ads, ...snapshot } = snapshotData(watch, result.observation, result.momentum.confidence);
  const productId = catalogProductId(watch.productKey);
  const product = productId ? await db.product.findUnique({ where: { id: productId }, select: { id: true, category: true } }) : null;
  await db.$transaction([
    db.adMomentumSnapshot.create({ data: { ...snapshot, ads: { createMany: { data: ads } } } }),
    db.adWatch.update({ where: { id: watch.id }, data: { lastCheckedAt: snapshot.observedAt } }),
    ...(product ? [db.evidence.create({ data: trendEvidenceData(product.id, watch, result.observation.momentum) })] : []),
  ]);
  return { outcome: "recorded", category: product?.category ?? null };
}
