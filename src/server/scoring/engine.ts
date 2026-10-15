// Deterministic scoring engine — pure functions, no I/O, no clock, no LLM.
// Same inputs + same `asOf` date ⇒ byte-identical output.
//
// Scores are ESTIMATES (CLAUDE.md Rule 4). Every score carries a confidence
// (0–1) and the ids of the evidence it was computed from (Rule 3). If there is
// no usable evidence for a dimension, NO score is produced — never a default.
//
// ── Formulas (methodology v1.5.0) ───────────────────────────────────────────
//
// Evidence weight     w = (quality / 100) × 0.5^(ageDays / 90) × sourceWeight[sourceType]
//                     (90-day half-life; future-dated evidence is ignored). Age counts from
//                     publishedAt when the source dates the fact (e.g. an expert review),
//                     otherwise from observedAt — reading an old review today doesn't make it new.
//
// Re-captures         RATING, REVIEW_COUNT and SENTIMENT are snapshots: repeated captures
//                     from the same source URL count once (latest wins), so re-submitting a
//                     page can't inflate a score. SEARCH_INTEREST is a time series — every
//                     capture is kept, because TREND needs the history.
//
// Shrunk mean         S = (Σ wᵢ·xᵢ + K·50) / (Σ wᵢ + K),  K = 1
//                     Pulls thinly-evidenced products toward a neutral 50.
//
// Confidence          C = 1 − e^(−Σw / 2)       (more, better, fresher evidence → closer to 1)
//
// QUALITY             x = rating / 5 × 100                         over RATING evidence
// SENTIMENT           x = (sentiment + 1) / 2 × 100                over SENTIMENT evidence
// DEMAND              x = min(100, 100 × log10(1+n) / log10(1+50 000))  for REVIEW_COUNT n
//                     (Not search interest: Google Trends scales every keyword to its own
//                     busiest week = 100, so the index shows direction, not size. v1.3.0)
// TREND               weighted least-squares slope of SEARCH_INTEREST vs time,
//                     S = clamp(50 + 2.5 × slopePer30Days)         (+20 pts/month ⇒ 100)
//                     Needs ≥ 2 points spanning ≥ 7 days.
// VALUE               priceScore = clamp(50 + 50 × log2(categoryMedian / bestPrice))
//                     S = 0.5 × QUALITY + 0.5 × priceScore
//                     bestPrice = lowest CURRENT offer: each store's newest capture from the
//                     last 30 days, counted only if that capture is in stock or pre-order,
//                     so an older, cheaper capture never stands in for a store's price (v1.5.0);
//                     needs ≥ 2 priced products in the category and a QUALITY score.
//                     Prices in different currencies are compared in euros at the ECB
//                     reference rates in `input.fx` (v1.4.0); a currency the ECB doesn't
//                     publish is compared only with prices in that same currency.
//                     C = C_quality × min(1, (pricedPeers − 1) / 4)
// OVERALL             weighted mean of available dimensions:
//                     QUALITY .35, VALUE .25, DEMAND .20, SENTIMENT .10, TREND .10
//                     C = Σ(weight × C_dim) / Σ(all weights)  — missing dimensions count as 0

import type { Availability, EvidenceMetric, ScoreDimension, SourceType } from "@/generated/prisma/enums";
import { toEur, type FxRates } from "./fx";

export const METHODOLOGY_VERSION = "1.5.0";

const HALF_LIFE_DAYS = 90;
const PRIOR = 50;
const PRIOR_WEIGHT = 1;
const CONFIDENCE_SCALE = 2;
const REVIEW_COUNT_REFERENCE = 50_000;
const TREND_POINTS_PER_MONTH_TO_MAX = 20;
const TREND_MIN_SPAN_DAYS = 7;
export const OFFER_MAX_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

export const SOURCE_WEIGHT: Record<SourceType, number> = {
  REVIEW: 1.0,
  NEWS: 0.9,
  RETAILER: 0.8,
  MARKETPLACE: 0.8,
  FORUM: 0.7,
  MANUFACTURER: 0.6, // self-reported, discounted for bias
  SOCIAL: 0.5,
  OTHER: 0.5,
};

export const OVERALL_WEIGHTS: Record<Exclude<ScoreDimension, "OVERALL">, number> = {
  QUALITY: 0.35,
  VALUE: 0.25,
  DEMAND: 0.2,
  SENTIMENT: 0.1,
  TREND: 0.1,
};

// ── Inputs ───────────────────────────────────────────────────────────────────

export type EvidenceFact = {
  id: string;
  sourceUrl: string;
  sourceType: SourceType;
  observedAt: Date;
  publishedAt?: Date | null; // when the source published it, if known
  qualityScore: number; // 0–100
  metric: EvidenceMetric | null;
  metricValue: number | null;
};

export type OfferFact = {
  merchant: string; // the store, so only its newest capture counts
  price: number;
  currency: string;
  availability: Availability;
  observedAt: Date;
  sourceEvidenceId: string;
};

export type ScoringInput = {
  asOf: Date;
  evidence: EvidenceFact[];
  offers: OfferFact[];
  // Best current price of every product in the same category (including this
  // one), keyed by currency. Used only for VALUE.
  categoryBestPrices: { currency: string; price: number }[];
  // Exchange rates for comparing prices across currencies.
  fx: FxRates;
};

export type DimensionScore = {
  dimension: ScoreDimension;
  value: number; // 0–100, 2 dp
  confidence: number; // 0–1, 3 dp
  evidenceIds: string[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
/** Confidence from summed evidence weight: C = 1 − e^(−Σw/2). Shared with the live engine (v2). */
export const confidenceFrom = (weightSum: number) => 1 - Math.exp(-weightSum / CONFIDENCE_SCALE);

export function evidenceWeight(e: EvidenceFact, asOf: Date): number {
  if (e.observedAt.getTime() > asOf.getTime()) return 0; // not yet observed as of this calculation
  const since = e.publishedAt && e.publishedAt.getTime() < e.observedAt.getTime() ? e.publishedAt : e.observedAt;
  const ageDays = (asOf.getTime() - since.getTime()) / DAY_MS;
  return (e.qualityScore / 100) * 0.5 ** (ageDays / HALF_LIFE_DAYS) * SOURCE_WEIGHT[e.sourceType];
}

type Point = { id: string; x: number; w: number; t: number };

const TIME_SERIES_METRICS: EvidenceMetric[] = ["SEARCH_INTEREST"];

/** For snapshot metrics keep only the latest capture per source URL (ties → highest id). */
function latestPerSource(evidence: EvidenceFact[]): EvidenceFact[] {
  const latest = new Map<string, EvidenceFact>();
  for (const e of evidence) {
    const cur = latest.get(e.sourceUrl);
    const newer =
      !cur ||
      e.observedAt.getTime() > cur.observedAt.getTime() ||
      (e.observedAt.getTime() === cur.observedAt.getTime() && e.id > cur.id);
    if (newer) latest.set(e.sourceUrl, e);
  }
  return [...latest.values()];
}

function points(input: ScoringInput, metric: EvidenceMetric, normalise: (v: number) => number): Point[] {
  const usable = input.evidence.filter(
    (e) => e.metric === metric && e.metricValue !== null && e.observedAt.getTime() <= input.asOf.getTime(),
  );
  const deduped = TIME_SERIES_METRICS.includes(metric) ? usable : latestPerSource(usable);
  return deduped
    .map((e) => ({
      id: e.id,
      x: normalise(e.metricValue as number),
      w: evidenceWeight(e, input.asOf),
      t: e.observedAt.getTime(),
    }))
    .filter((p) => p.w > 0)
    .sort((a, b) => a.id.localeCompare(b.id)); // stable order ⇒ stable float sums
}

function shrunkScore(dimension: ScoreDimension, pts: Point[]): DimensionScore | null {
  if (pts.length === 0) return null;
  const wSum = pts.reduce((s, p) => s + p.w, 0);
  const value = (pts.reduce((s, p) => s + p.w * p.x, 0) + PRIOR_WEIGHT * PRIOR) / (wSum + PRIOR_WEIGHT);
  return {
    dimension,
    value: round(clamp(value), 2),
    confidence: round(confidenceFrom(wSum), 3),
    evidenceIds: pts.map((p) => p.id),
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── Dimensions ───────────────────────────────────────────────────────────────

export function scoreQuality(input: ScoringInput) {
  return shrunkScore("QUALITY", points(input, "RATING", (v) => (v / 5) * 100));
}

export function scoreSentiment(input: ScoringInput) {
  return shrunkScore("SENTIMENT", points(input, "SENTIMENT", (v) => ((v + 1) / 2) * 100));
}

export function scoreDemand(input: ScoringInput) {
  return shrunkScore(
    "DEMAND",
    points(input, "REVIEW_COUNT", (n) => Math.min(100, (100 * Math.log10(1 + n)) / Math.log10(1 + REVIEW_COUNT_REFERENCE))),
  );
}

export function scoreTrend(input: ScoringInput): DimensionScore | null {
  const pts = points(input, "SEARCH_INTEREST", (v) => v);
  if (pts.length < 2) return null;
  const span = (Math.max(...pts.map((p) => p.t)) - Math.min(...pts.map((p) => p.t))) / DAY_MS;
  if (span < TREND_MIN_SPAN_DAYS) return null;

  // Weighted least squares: x = search index, t = days.
  const wSum = pts.reduce((s, p) => s + p.w, 0);
  const tMean = pts.reduce((s, p) => s + p.w * (p.t / DAY_MS), 0) / wSum;
  const xMean = pts.reduce((s, p) => s + p.w * p.x, 0) / wSum;
  const cov = pts.reduce((s, p) => s + p.w * (p.t / DAY_MS - tMean) * (p.x - xMean), 0);
  const varT = pts.reduce((s, p) => s + p.w * (p.t / DAY_MS - tMean) ** 2, 0);
  const slopePer30Days = (cov / varT) * 30;

  return {
    dimension: "TREND",
    value: round(clamp(50 + (50 / TREND_POINTS_PER_MONTH_TO_MAX) * slopePer30Days), 2),
    confidence: round(confidenceFrom(wSum), 3),
    evidenceIds: pts.map((p) => p.id),
  };
}

/**
 * The cheapest in-stock offer seen in the last 30 days. Offers in one currency are
 * compared as-is; mixed currencies are compared in euros, skipping any currency
 * without an ECB rate. Returns the offer in its own price and currency.
 */
/**
 * Each store's current offer: its newest capture from the last 30 days, kept only if
 * that capture is in stock or on pre-order. A store that has since raised its price,
 * or sold out, is never represented by an older capture.
 */
export function currentOffers<T extends OfferFact>(offers: T[], asOf: Date): T[] {
  const newest = new Map<string, T>();
  for (const o of offers) {
    const age = (asOf.getTime() - o.observedAt.getTime()) / DAY_MS;
    if (age < 0 || age > OFFER_MAX_AGE_DAYS) continue;
    const key = o.merchant.toLowerCase();
    const prev = newest.get(key);
    if (
      !prev ||
      o.observedAt > prev.observedAt ||
      (o.observedAt.getTime() === prev.observedAt.getTime() && o.sourceEvidenceId > prev.sourceEvidenceId)
    ) {
      newest.set(key, o);
    }
  }
  return [...newest.values()].filter((o) => o.availability === "IN_STOCK" || o.availability === "PREORDER");
}

export function bestCurrentOffer<T extends OfferFact>(offers: T[], asOf: Date, fx: FxRates): T | null {
  const live = currentOffers(offers, asOf);
  const oneCurrency = live.every((o) => o.currency === live[0].currency);
  return (
    live
      .flatMap((o) => {
        const cost = oneCurrency ? o.price : toEur(o.price, o.currency, fx);
        return cost === null ? [] : [{ o, cost }];
      })
      .sort((a, b) => a.cost - b.cost || a.o.sourceEvidenceId.localeCompare(b.o.sourceEvidenceId))[0]?.o ?? null
  );
}

export function scoreValue(input: ScoringInput, quality: DimensionScore | null): DimensionScore | null {
  if (!quality) return null;
  const best = bestCurrentOffer(input.offers, input.asOf, input.fx);
  if (!best) return null;
  // Compare in euros when the ECB publishes the currency; otherwise only within it.
  const bestEur = toEur(best.price, best.currency, input.fx);
  const peerPrices =
    bestEur === null
      ? input.categoryBestPrices.filter((p) => p.currency === best.currency).map((p) => p.price)
      : input.categoryBestPrices.flatMap((p) => toEur(p.price, p.currency, input.fx) ?? []);
  if (peerPrices.length < 2) return null;

  const priceScore = clamp(50 + 50 * Math.log2(median(peerPrices) / (bestEur ?? best.price)));
  const value = 0.5 * quality.value + 0.5 * priceScore;
  const peerFactor = Math.min(1, (peerPrices.length - 1) / 4);

  return {
    dimension: "VALUE",
    value: round(clamp(value), 2),
    confidence: round(quality.confidence * peerFactor, 3),
    evidenceIds: [...new Set([...quality.evidenceIds, best.sourceEvidenceId])].sort(),
  };
}

export function scoreOverall(parts: DimensionScore[]): DimensionScore | null {
  const available = parts.filter((p) => p.dimension !== "OVERALL");
  if (available.length === 0) return null;
  const weightOf = (p: DimensionScore) => OVERALL_WEIGHTS[p.dimension as keyof typeof OVERALL_WEIGHTS];
  const totalWeight = Object.values(OVERALL_WEIGHTS).reduce((s, w) => s + w, 0);
  const availWeight = available.reduce((s, p) => s + weightOf(p), 0);

  return {
    dimension: "OVERALL",
    value: round(clamp(available.reduce((s, p) => s + weightOf(p) * p.value, 0) / availWeight), 2),
    confidence: round(available.reduce((s, p) => s + weightOf(p) * p.confidence, 0) / totalWeight, 3),
    evidenceIds: [...new Set(available.flatMap((p) => p.evidenceIds))].sort(),
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function calculateScores(input: ScoringInput): DimensionScore[] {
  const quality = scoreQuality(input);
  const parts = [quality, scoreValue(input, quality), scoreDemand(input), scoreSentiment(input), scoreTrend(input)].filter(
    (s): s is DimensionScore => s !== null,
  );
  const overall = scoreOverall(parts);
  return overall ? [overall, ...parts] : parts;
}
