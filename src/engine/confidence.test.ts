import { describe, expect, it } from "vitest";
import type { Evidence } from "@/types/dossier";
import { calculateConfidence, evidenceWeight, FINANCIAL_THRESHOLD, VERDICT_THRESHOLD } from "./confidence";

const asOf = new Date("2026-10-16T12:00:00.000Z");
const daysAgo = (d: number) => new Date(asOf.getTime() - d * 86_400_000).toISOString();
let n = 0;
const ev = (over: Partial<Evidence> = {}): Evidence => ({
  id: `e${++n}`,
  provider: "rainforest",
  sourceType: "marketplace",
  sourceUrl: `https://www.amazon.co.uk/dp/B0${n}`,
  observedAt: daysAgo(0),
  publishedAt: null,
  quality: 80,
  claim: "listed at £19.99",
  value: 19.99,
  ...over,
});
const fresh = (k: number) => Array.from({ length: k }, () => ev());

describe("thresholds", () => {
  it("are 0.5 for the verdict and 0.7 for financial parts", () => {
    expect([VERDICT_THRESHOLD, FINANCIAL_THRESHOLD]).toEqual([0.5, 0.7]);
  });
});

describe("calculateConfidence", () => {
  it("is 0 with no evidence", () => {
    expect(calculateConfidence([], asOf)).toBe(0);
  });

  it("grows with distinct sources: about three clear the verdict gate, four the financial gate", () => {
    expect(calculateConfidence(fresh(2), asOf)).toBeLessThan(VERDICT_THRESHOLD);
    expect(calculateConfidence(fresh(3), asOf)).toBeGreaterThanOrEqual(VERDICT_THRESHOLD);
    expect(calculateConfidence(fresh(3), asOf)).toBeLessThan(FINANCIAL_THRESHOLD);
    expect(calculateConfidence(fresh(4), asOf)).toBeGreaterThanOrEqual(FINANCIAL_THRESHOLD);
  });

  it("counts a re-read of the same page once (its newest capture)", () => {
    const page = "https://www.amazon.co.uk/dp/SAME";
    expect(calculateConfidence([ev({ sourceUrl: page, observedAt: daysAgo(5) }), ev({ sourceUrl: page })], asOf)).toBe(calculateConfidence([ev({ sourceUrl: page })], asOf));
  });

  it("halves an item's weight every 90 days, ageing from the source's own date when it has one", () => {
    const now = evidenceWeight(ev(), asOf);
    expect(evidenceWeight(ev({ observedAt: daysAgo(90) }), asOf)).toBeCloseTo(now / 2, 10);
    expect(evidenceWeight(ev({ publishedAt: daysAgo(90) }), asOf)).toBeCloseTo(now / 2, 10);
  });

  it("weighs supplier evidence by match quality, and an unscored supplier listing not at all", () => {
    const supplier = (matchScore: number | null) => ev({ sourceType: "supplier", provider: "aliexpress", matchScore });
    expect(evidenceWeight(supplier(0.5), asOf)).toBeCloseTo(evidenceWeight(supplier(1), asOf) / 2, 10);
    expect(evidenceWeight(supplier(null), asOf)).toBe(0);
  });

  it("ignores evidence observed after the calculation time", () => {
    expect(calculateConfidence([ev({ observedAt: "2026-10-17T00:00:00.000Z" })], asOf)).toBe(0);
  });
});
