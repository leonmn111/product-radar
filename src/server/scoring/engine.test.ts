import { describe, expect, it } from "vitest";
import { calculateScores, evidenceWeight, type EvidenceFact, type OfferFact, type ScoringInput } from "./engine";

const asOf = new Date("2026-10-01T00:00:00Z");
const daysAgo = (d: number) => new Date(asOf.getTime() - d * 86_400_000);

let n = 0;
const ev = (over: Partial<EvidenceFact>): EvidenceFact => ({
  id: `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`,
  sourceUrl: `https://source.test/${n}`,
  sourceType: "REVIEW",
  observedAt: daysAgo(1),
  qualityScore: 80,
  metric: null,
  metricValue: null,
  ...over,
});
const offer = (price: number, evidenceId: string, over: Partial<OfferFact> = {}): OfferFact => ({
  price,
  currency: "USD",
  availability: "IN_STOCK",
  observedAt: daysAgo(2),
  sourceEvidenceId: evidenceId,
  ...over,
});
const byDim = (input: ScoringInput) => Object.fromEntries(calculateScores(input).map((s) => [s.dimension, s]));

describe("scoring engine", () => {
  it("produces no scores at all without numeric evidence", () => {
    const input = { asOf, evidence: [ev({})], offers: [], categoryBestPrices: [] };
    expect(calculateScores(input)).toEqual([]);
  });

  it("is deterministic: same input gives identical output", () => {
    const evidence = [ev({ metric: "RATING", metricValue: 4.5 }), ev({ metric: "SENTIMENT", metricValue: 0.4 })];
    const input = { asOf, evidence, offers: [], categoryBestPrices: [] };
    expect(calculateScores(input)).toEqual(calculateScores(structuredClone(input)));
    expect(calculateScores(input)).toEqual(calculateScores({ ...input, evidence: [...evidence].reverse() }));
  });

  it("weights evidence by quality, age (90-day half-life) and source type", () => {
    const fresh = ev({ observedAt: asOf, qualityScore: 100, sourceType: "REVIEW" });
    expect(evidenceWeight(fresh, asOf)).toBe(1);
    expect(evidenceWeight({ ...fresh, observedAt: daysAgo(90) }, asOf)).toBeCloseTo(0.5);
    expect(evidenceWeight({ ...fresh, qualityScore: 50 }, asOf)).toBeCloseTo(0.5);
    expect(evidenceWeight({ ...fresh, sourceType: "MANUFACTURER" }, asOf)).toBeCloseTo(0.6);
    expect(evidenceWeight({ ...fresh, observedAt: new Date(asOf.getTime() + 1) }, asOf)).toBe(0);
  });

  it("QUALITY matches the hand-calculated formula", () => {
    // One 5-star rating, weight 1 ⇒ (1×100 + 1×50) / (1+1) = 75; confidence 1−e^(−0.5)
    const input = {
      asOf,
      evidence: [ev({ metric: "RATING", metricValue: 5, qualityScore: 100, observedAt: asOf })],
      offers: [],
      categoryBestPrices: [],
    };
    const q = byDim(input).QUALITY;
    expect(q.value).toBe(75);
    expect(q.confidence).toBe(0.393);
  });

  it("more evidence raises confidence and moves the score away from neutral", () => {
    const one = [ev({ metric: "RATING", metricValue: 4.8 })];
    const many = [...one, ...Array.from({ length: 6 }, () => ev({ metric: "RATING", metricValue: 4.8 }))];
    const a = byDim({ asOf, evidence: one, offers: [], categoryBestPrices: [] }).QUALITY;
    const b = byDim({ asOf, evidence: many, offers: [], categoryBestPrices: [] }).QUALITY;
    expect(b.confidence).toBeGreaterThan(a.confidence);
    expect(b.value).toBeGreaterThan(a.value);
  });

  it("re-captures of the same source count once (latest wins), so resubmitting can't inflate a score", () => {
    const once = [ev({ metric: "RATING", metricValue: 4.2, sourceUrl: "https://shop.test/p", observedAt: daysAgo(2) })];
    const again = [
      ...once,
      ev({ metric: "RATING", metricValue: 4.2, sourceUrl: "https://shop.test/p", observedAt: daysAgo(1) }),
      ev({ metric: "RATING", metricValue: 4.2, sourceUrl: "https://shop.test/p", observedAt: daysAgo(0) }),
    ];
    const latestOnly = byDim({ asOf, evidence: [again[2]], offers: [], categoryBestPrices: [] }).QUALITY;
    const resubmitted = byDim({ asOf, evidence: again, offers: [], categoryBestPrices: [] }).QUALITY;
    expect(resubmitted).toEqual(latestOnly); // three captures score exactly like one
    expect(resubmitted.evidenceIds).toEqual([again[2].id]); // only the latest capture is cited
  });

  it("TREND is above 50 when search interest rises and below when it falls", () => {
    const series = (vals: number[]) =>
      vals.map((v, i) =>
        ev({ metric: "SEARCH_INTEREST", metricValue: v, sourceUrl: "https://trends.test/x", observedAt: daysAgo(60 - i * 30) }),
      );
    const up = byDim({ asOf, evidence: series([40, 50, 60]), offers: [], categoryBestPrices: [] }).TREND;
    const down = byDim({ asOf, evidence: series([60, 50, 40]), offers: [], categoryBestPrices: [] }).TREND;
    expect(up.value).toBeGreaterThan(50);
    expect(down.value).toBeLessThan(50);
  });

  it("TREND needs at least two points spanning a week", () => {
    const evidence = [
      ev({ metric: "SEARCH_INTEREST", metricValue: 40, observedAt: daysAgo(3) }),
      ev({ metric: "SEARCH_INTEREST", metricValue: 60, observedAt: daysAgo(1) }),
    ];
    expect(byDim({ asOf, evidence, offers: [], categoryBestPrices: [] }).TREND).toBeUndefined();
  });

  it("VALUE rewards a cheaper price at equal quality and needs category peers", () => {
    const rating = ev({ metric: "RATING", metricValue: 4.5 });
    const src = ev({ sourceType: "RETAILER" });
    const peers = [{ currency: "USD", price: 100 }, { currency: "USD", price: 200 }];
    const cheap = byDim({ asOf, evidence: [rating, src], offers: [offer(100, src.id)], categoryBestPrices: peers }).VALUE;
    const dear = byDim({ asOf, evidence: [rating, src], offers: [offer(200, src.id)], categoryBestPrices: peers }).VALUE;
    expect(cheap.value).toBeGreaterThan(dear.value);
    expect(cheap.evidenceIds).toContain(src.id);

    const alone = byDim({ asOf, evidence: [rating, src], offers: [offer(100, src.id)], categoryBestPrices: [peers[0]] });
    expect(alone.VALUE).toBeUndefined();
  });

  it("VALUE ignores out-of-stock and stale offers", () => {
    const rating = ev({ metric: "RATING", metricValue: 4.5 });
    const src = ev({ sourceType: "RETAILER" });
    const peers = [{ currency: "USD", price: 100 }, { currency: "USD", price: 200 }];
    const offers = [offer(10, src.id, { availability: "OUT_OF_STOCK" }), offer(5, src.id, { observedAt: daysAgo(45) })];
    expect(byDim({ asOf, evidence: [rating, src], offers, categoryBestPrices: peers }).VALUE).toBeUndefined();
  });

  it("OVERALL penalises confidence for missing dimensions and stays in range", () => {
    const evidence = [ev({ metric: "RATING", metricValue: 5, qualityScore: 100, observedAt: asOf })];
    const s = byDim({ asOf, evidence, offers: [], categoryBestPrices: [] });
    expect(s.OVERALL.value).toBe(s.QUALITY.value); // only dimension available
    expect(s.OVERALL.confidence).toBeCloseTo(s.QUALITY.confidence * 0.35, 3);
    for (const d of Object.values(s)) {
      expect(d.value).toBeGreaterThanOrEqual(0);
      expect(d.value).toBeLessThanOrEqual(100);
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
      expect(d.evidenceIds.length).toBeGreaterThan(0);
    }
  });
});
