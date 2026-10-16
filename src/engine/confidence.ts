// Confidence from evidence, and the two display thresholds (CLAUDE.md Rule 5). Pure: pass `asOf` for
// a deterministic result (it defaults to now).
//
// Each distinct source counts once (its newest capture) and weighs
//   w = quality / 100 × 0.5^(age in days / 90) × source-type weight × match quality
// where match quality, for supplier evidence, combines how well its title and its image match the
// product as 1 − (1 − title)(1 − image) (two independent signals; a missing one counts 0), and is 1
// for any other evidence. A strong image match can lift a weak title match.
// Confidence C = 1 − e^(−Σw / 2): more sources, fresher, better matched → closer to 1.
// Reaching 0.7 takes about four fresh, independent marketplace listings; 0.5 about three.

import type { Evidence, EvidenceSourceType } from "@/types/dossier";

/** A Verdict is shown from this confidence. */
export const VERDICT_THRESHOLD = 0.5;
/** Every financial and numeric part (margins, momentum, saturation, scores) is shown from this confidence. */
export const FINANCIAL_THRESHOLD = 0.7;

const HALF_LIFE_DAYS = 90;
const SCALE = 2;
const DAY_MS = 86_400_000;

/** How much one source type counts. Same scale as v1's scoring engine. */
export const SOURCE_TYPE_WEIGHT: Record<EvidenceSourceType, number> = {
  official: 1,
  review: 1,
  ads_library: 0.9,
  marketplace: 0.8,
  supplier: 0.8,
  trend: 0.7,
  other: 0.5,
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** One evidence item's weight at `asOf`; 0 for evidence observed after it. */
export function evidenceWeight(e: Evidence, asOf: Date): number {
  const observed = new Date(e.observedAt).getTime();
  if (!Number.isFinite(observed) || observed > asOf.getTime()) return 0;
  // A source that dates its fact (e.g. a review) ages from that date, not from when we read it.
  const published = e.publishedAt ? new Date(e.publishedAt).getTime() : NaN;
  const since = Number.isFinite(published) && published < observed ? published : observed;
  const ageDays = (asOf.getTime() - since) / DAY_MS;
  // A supplier listing supports a product only as well as it matches it; unscored, it can't.
  const match = e.sourceType === "supplier" ? 1 - (1 - clamp01(e.matchScore ?? 0)) * (1 - clamp01(e.imageMatch?.score ?? 0)) : 1;
  const quality = Math.max(0, Math.min(100, e.quality)) / 100;
  return quality * 0.5 ** (ageDays / HALF_LIFE_DAYS) * SOURCE_TYPE_WEIGHT[e.sourceType] * match;
}

/** 0–1: how strongly this evidence supports a part of the Dossier. */
export function calculateConfidence(evidence: Evidence[], asOf: Date = new Date()): number {
  // Distinct sources: re-reading the same page doesn't add support, so keep each source's newest capture.
  const newest = new Map<string, Evidence>();
  for (const e of evidence) {
    if (new Date(e.observedAt).getTime() > asOf.getTime()) continue;
    const seen = newest.get(e.sourceUrl);
    if (!seen || e.observedAt > seen.observedAt) newest.set(e.sourceUrl, e);
  }
  const total = [...newest.values()].reduce((s, e) => s + evidenceWeight(e, asOf), 0);
  return Math.round((1 - Math.exp(-total / SCALE)) * 1000) / 1000;
}
