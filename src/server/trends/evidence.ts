// Pure: turns a Google Trends weekly series into SEARCH_INTEREST evidence, one row
// per complete calendar month (the average of the weeks starting in it).
//
// Monthly, not weekly: one SerpApi call returns ~52 weeks, and 52 rows from a
// single lookup would count as 52 pieces of evidence and inflate confidence. A
// monthly point matches how the demo data samples search interest.
//
// Each month is observed at the end of its last week, so TREND's slope runs over
// real dates. Re-runs add only months not stored yet (contentHash). Google scales
// every lookup to its own busiest week, so a month added later can sit on a
// slightly different scale than older ones: a known approximation.

import { createHash } from "node:crypto";
import type { EvidenceInput } from "@/lib/validation/evidence";
import type { InterestSeries, WeeklyInterest } from "./serpapi";

export const TRENDS_SOURCE_NAME = "Google Trends (via SerpApi)";
// Google's own figures, but for a keyword we chose to stand for the product.
export const TRENDS_QUALITY = 70;

const DAY_MS = 86_400_000;
const monthKey = (d: Date) => d.toISOString().slice(0, 7); // "2026-03", in UTC
const monthName = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export type MonthlyInterest = { month: string; average: number; weeks: WeeklyInterest[]; observedAt: Date };

/**
 * Average interest per calendar month, complete months only: not the month the
 * data was fetched in, and not a first month whose data starts after its first week.
 */
export function monthlyInterest(weeks: WeeklyInterest[], fetchedAt: Date): MonthlyInterest[] {
  const byMonth = new Map<string, WeeklyInterest[]>();
  for (const w of weeks) byMonth.set(monthKey(w.weekStart), [...(byMonth.get(monthKey(w.weekStart)) ?? []), w]);

  const current = monthKey(fetchedAt);
  return [...byMonth.entries()]
    .filter(([month, ws]) => month < current && ws[0].weekStart.getUTCDate() <= 7)
    .map(([month, ws]) => {
      const lastWeekEnd = new Date(ws.at(-1)!.weekStart.getTime() + 7 * DAY_MS);
      return {
        month,
        average: Math.round((ws.reduce((s, w) => s + w.value, 0) / ws.length) * 10) / 10,
        weeks: ws,
        observedAt: lastWeekEnd < fetchedAt ? lastWeekEnd : fetchedAt,
      };
    });
}

/** The dedupe key for one keyword-month: re-running the same month adds nothing. */
export function trendContentHash(keyword: string, month: string) {
  return createHash("sha256").update(`google-trends:v1:${keyword.toLowerCase()}:${month}`).digest("hex");
}

export function trendEvidence(productId: string, series: InterestSeries): EvidenceInput[] {
  return monthlyInterest(series.weeks, series.fetchedAt).map((m) => ({
    productId,
    claim:
      `Google search interest for "${series.keyword}" averaged ${m.average}/100 in ${monthName(m.month)} ` +
      `(100 = its busiest week in the 12 months to ${longDate(series.fetchedAt)})`,
    excerpt:
      `Weekly values: ${m.weeks.map((w) => `${dayName(w.weekStart)} ${w.value}`).join(", ")}. ` +
      `Retrieved ${series.fetchedAt.toISOString().slice(0, 10)}.`,
    sourceUrl: series.trendsUrl,
    sourceName: TRENDS_SOURCE_NAME,
    sourceType: "OTHER",
    observedAt: m.observedAt,
    qualityScore: TRENDS_QUALITY,
    metric: "SEARCH_INTEREST",
    metricValue: m.average,
    contentHash: trendContentHash(series.keyword, m.month),
  }));
}

/** The newest month a run today would add, to skip products that are already up to date. */
export function latestCompleteMonth(now: Date) {
  return monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));
}
