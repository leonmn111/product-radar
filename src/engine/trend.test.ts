import { describe, expect, it } from "vitest";
import { calculateTrendSlope, dailySeries, type TimePoint } from "./trend";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 6, 1);
const line = (perDay: number, days: number, start = 10_000): TimePoint[] => Array.from({ length: days }, (_, d) => ({ at: T0 + d * DAY, value: start + perDay * d }));

describe("calculateTrendSlope", () => {
  it("returns the change per week of a straight line", () => {
    expect(calculateTrendSlope(line(-10, 84))).toBeCloseTo(-70, 9); // rank falling 10 a day: climbing the list
    expect(calculateTrendSlope(line(2.5, 30))).toBeCloseTo(17.5, 9);
    expect(calculateTrendSlope(line(0, 30))).toBe(0);
  });

  it("fits the least-squares line through noisy points", () => {
    // y = 3 per week, plus an alternating ±1 wobble. By hand: Σ(x − x̄)² = 17.5 and the wobble adds
    // Σ(x − x̄)·e = −3, so the least-squares slope is 3 − 3/17.5.
    const pts = [0, 1, 2, 3, 4, 5].map((w) => ({ at: T0 + w * 7 * DAY, value: 3 * w + (w % 2 === 0 ? 1 : -1) }));
    expect(calculateTrendSlope(pts)).toBeCloseTo(3 - 3 / 17.5, 9);
  });

  it("doesn't depend on the order of the points or on where time starts", () => {
    const pts = line(-4, 20);
    expect(calculateTrendSlope([...pts].reverse())).toBeCloseTo(-28, 9);
    expect(calculateTrendSlope(pts.map((p) => ({ ...p, at: p.at + 1e12 })))).toBeCloseTo(-28, 6);
  });

  it("has no trend to give for fewer than two points, one moment in time, or unusable values", () => {
    expect(calculateTrendSlope([])).toBeNull();
    expect(calculateTrendSlope([{ at: T0, value: 5 }])).toBeNull();
    expect(calculateTrendSlope([{ at: T0, value: 5 }, { at: T0, value: 9 }])).toBeNull();
    expect(calculateTrendSlope([{ at: T0, value: 5 }, { at: T0 + DAY, value: Number.NaN }])).toBeNull();
  });
});

describe("dailySeries", () => {
  it("holds each value until the next change, one point per UTC day, and leaves unknown days out", () => {
    const changes = [
      { at: T0 + 2 * 3_600_000, value: 100 }, // day 0, 02:00
      { at: T0 + 2 * DAY + 5 * 3_600_000, value: null }, // day 2: out of stock
      { at: T0 + 3 * DAY + 1, value: 120 }, // day 3
    ];
    expect(dailySeries(changes, new Date(T0 - DAY), new Date(T0 + 4 * DAY))).toEqual([
      { at: T0, value: 100 },
      { at: T0 + DAY, value: 100 },
      { at: T0 + 3 * DAY, value: 120 },
      { at: T0 + 4 * DAY, value: 120 },
    ]);
  });
});
