import { describe, expect, it } from "vitest";
import { calculateMomentum, FLAT_BAND_PCT_PER_WEEK, MIN_RANK_DAYS, trendDirection, unitsFromRecentSales } from "./momentum";

const DAY = 86_400_000;
const TO = Date.UTC(2026, 9, 16);
/** `days` daily points ending at TO, value = start + perDay × day. */
const series = (days: number, start: number, perDay: number) => Array.from({ length: days }, (_, i) => ({ at: TO - (days - 1 - i) * DAY, value: start + perDay * i }));
const history = (rank: { at: number; value: number }[], price = series(90, 1999, -2)) => ({ from: new Date(TO - 90 * DAY).toISOString(), to: new Date(TO).toISOString(), salesRank: rank, newPrice: price });

describe("trendDirection", () => {
  it("reads a falling rank as accelerating sales, a rising one as decelerating, within ±2% a week as flat", () => {
    expect(FLAT_BAND_PCT_PER_WEEK).toBe(2);
    expect(trendDirection(-300, 5000)).toBe("ACCELERATING"); // −6% a week
    expect(trendDirection(300, 5000)).toBe("DECELERATING");
    expect(trendDirection(-50, 5000)).toBe("FLAT"); // −1% a week
    expect(trendDirection(100, 5000)).toBe("FLAT"); // exactly +2%: still flat
    expect(trendDirection(-10, 0)).toBe("FLAT");
  });
});

describe("unitsFromRecentSales", () => {
  it("takes the lower bound of Amazon's badge, and nothing else", () => {
    expect(unitsFromRecentSales("5K+ bought in past month")).toBe(5000);
    expect(unitsFromRecentSales("500+ bought in past month")).toBe(500);
    expect(unitsFromRecentSales("1.5K+ bought in past month")).toBe(1500);
    expect(unitsFromRecentSales("Best seller")).toBeNull();
    expect(unitsFromRecentSales(null)).toBeNull();
  });
});

describe("calculateMomentum", () => {
  it("fits the last 12 weeks: a rank falling ~50 places a day from 9,000 is accelerating", () => {
    const r = calculateMomentum({ history: history(series(90, 9000, -50)), recentSales: "1K+ bought in past month" });
    if (!("momentum" in r)) throw new Error(r.missing);
    expect(r.momentum).toMatchObject({ trendDirection: "ACCELERATING", trendSlope12w: -350, priceSlope12w: -14, salesVelocity: { unitsPerMonth: 1000 } });
    expect(r.momentum.window.rankDays).toBe(85); // the last 84 days, both ends included
    expect(r.momentum.rankChangePctPerWeek).toBeLessThan(-FLAT_BAND_PCT_PER_WEEK);
    expect([r.momentum.adDurationDays, r.momentum.adDurationMethod]).toEqual([null, null]);
  });

  it("calls a steady rank flat and a slipping one decelerating", () => {
    const flat = calculateMomentum({ history: history(series(90, 5000, 1)) });
    const slipping = calculateMomentum({ history: history(series(90, 3000, 40)) });
    expect("momentum" in flat && flat.momentum.trendDirection).toBe("FLAT");
    expect("momentum" in slipping && slipping.momentum.trendDirection).toBe("DECELERATING");
  });

  it("withholds momentum, and says why, with under 4 weeks of rank in the window", () => {
    expect(calculateMomentum({ history: history(series(MIN_RANK_DAYS - 1, 5000, -50)) })).toEqual({
      missing: `sales-rank history covering at least ${MIN_RANK_DAYS} of the last 84 days (${MIN_RANK_DAYS - 1} found)`,
    });
  });

  it("carries an ad duration with how it was measured, and leaves no price trend without price history", () => {
    const r = calculateMomentum({ history: history(series(60, 5000, -50), []), adDuration: { days: 42, method: "simulated" } });
    if (!("momentum" in r)) throw new Error(r.missing);
    expect([r.momentum.priceSlope12w, r.momentum.adDurationDays, r.momentum.adDurationMethod]).toEqual([null, 42, "simulated"]);
  });
});
