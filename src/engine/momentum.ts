// Momentum (ARCHITECTURE.md › Momentum): where a product's sales are heading, from 12 weeks of
// best-sellers rank history, plus price trend, sales velocity and ad duration where they're known.
// Pure. Every figure comes from the history and listing it's given; nothing missing is estimated.
//
// Direction rule (a calculated estimate, CLAUDE.md Rule 4): the rank's least-squares slope as a share
// of its average rank, per week. Below −2% a week (the rank falling, so sales rising) is ACCELERATING,
// above +2% is DECELERATING, in between is FLAT. Over 12 weeks ±2% a week is roughly ±24%.

import type { Momentum, TrendDirection } from "@/types/dossier";
import { calculateTrendSlope, type TimePoint } from "./trend";

export const MOMENTUM_WINDOW_DAYS = 84; // 12 weeks
export const MIN_RANK_DAYS = 28; // at least 4 weeks of daily rank in the window
export const FLAT_BAND_PCT_PER_WEEK = 2;

const DAY_MS = 86_400_000;

/** A rank slope (places per week) against the average rank → the direction of sales. */
export function trendDirection(rankSlopePerWeek: number, averageRank: number): TrendDirection {
  if (!(averageRank > 0)) return "FLAT";
  const pct = (rankSlopePerWeek / averageRank) * 100;
  if (pct < -FLAT_BAND_PCT_PER_WEEK) return "ACCELERATING";
  if (pct > FLAT_BAND_PCT_PER_WEEK) return "DECELERATING";
  return "FLAT";
}

/**
 * Amazon's own "bought in past month" badge as a lower bound: "5K+ bought in past month" → 5000.
 * Null for anything else (it's never guessed from rank).
 */
export function unitsFromRecentSales(text: string | null | undefined): number | null {
  const m = text?.match(/^\s*(\d+(?:\.\d+)?)\s*([KkMm]?)\+?\s+bought in (?:the )?past month/i);
  if (!m) return null;
  const n = Number(m[1]) * (m[2].toLowerCase() === "k" ? 1_000 : m[2].toLowerCase() === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
const inWindow = (pts: readonly TimePoint[], from: number) => pts.filter((p) => p.at >= from);

export type MomentumInputs = {
  history: { from: string; to: string; salesRank: TimePoint[]; newPrice: TimePoint[] };
  /** The listing's "bought in past month" text, if Amazon shows one. */
  recentSales?: string | null;
  /** Longest-running ad, in days; "simulated" only on development sample data. */
  adDuration?: { days: number; method: "simulated" } | null;
};

/**
 * Momentum from the history, or why it can't be worked out (`missing`). The slopes are fitted to the
 * last 12 weeks of the history; the rank needs at least 4 weeks of days in that window.
 */
export function calculateMomentum({ history, recentSales, adDuration }: MomentumInputs): { momentum: Momentum } | { missing: string } {
  const to = new Date(history.to).getTime();
  const from = to - MOMENTUM_WINDOW_DAYS * DAY_MS;
  const rank = inWindow(history.salesRank, from);
  if (rank.length < MIN_RANK_DAYS) {
    return { missing: `sales-rank history covering at least ${MIN_RANK_DAYS} of the last ${MOMENTUM_WINDOW_DAYS} days (${rank.length} found)` };
  }
  const slope = calculateTrendSlope(rank);
  if (slope === null) return { missing: "sales-rank history spread over more than one day" };
  const average = rank.reduce((s, p) => s + p.value, 0) / rank.length;
  const priceSlope = calculateTrendSlope(inWindow(history.newPrice, from));
  const units = unitsFromRecentSales(recentSales);
  return {
    momentum: {
      trendDirection: trendDirection(slope, average),
      trendSlope12w: round(slope, 1),
      rankChangePctPerWeek: round((slope / average) * 100, 2),
      priceSlope12w: priceSlope === null ? null : round(priceSlope, 1),
      salesVelocity: units === null ? null : { unitsPerMonth: units, method: `lower bound of Amazon's "${recentSales!.trim()}" badge` },
      adDurationDays: adDuration?.days ?? null,
      adDurationMethod: adDuration?.method ?? null,
      window: { from: new Date(Math.max(from, rank[0].at)).toISOString(), to: history.to, rankDays: rank.length },
    },
  };
}
