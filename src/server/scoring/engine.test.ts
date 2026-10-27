import { describe, expect, it } from "vitest";
import { bestCurrentOffer, calculateScores, evidenceWeight, type EvidenceFact, type OfferFact, type ScoringInput } from "./engine";
import { parseEcbDaily, toEur, type FxRates } from "./fx";

const asOf = new Date("2026-10-01T00:00:00Z");
// Round test rates (not real ones): 1 EUR = 1.25 USD = 0.80 GBP; no AED.
const fx: FxRates = { date: "2026-10-01", perEur: { USD: 1.25, GBP: 0.8 } };
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
  merchant: `store-${evidenceId}`, // one store per offer unless a test says otherwise
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
    const input = { asOf, evidence: [ev({})], offers: [], categoryBestPrices: [], fx };
    expect(calculateScores(input)).toEqual([]);
  });

  it("is deterministic: same input gives identical output", () => {
    const evidence = [ev({ metric: "RATING", metricValue: 4.5 }), ev({ metric: "SENTIMENT", metricValue: 0.4 })];
    const input = { asOf, evidence, offers: [], categoryBestPrices: [], fx };
    expect(calculateScores(input)).toEqual(calculateScores(structuredClone(input)));
    expect(calculateScores(input)).toEqual(calculateScores({ ...input, evidence: [...evidence].reverse() }));
  });

  it("ages a dated source from when it was published, not when we read it", () => {
    const readToday = ev({ observedAt: daysAgo(0) });
    const publishedLastQuarter = ev({ observedAt: daysAgo(0), publishedAt: daysAgo(90) });
    expect(evidenceWeight(publishedLastQuarter, asOf)).toBeCloseTo(evidenceWeight(readToday, asOf) / 2, 10);
    // A publication date after our capture is impossible, so capture time is used.
    expect(evidenceWeight(ev({ observedAt: daysAgo(0), publishedAt: daysAgo(-5) }), asOf)).toBe(evidenceWeight(readToday, asOf));
    // Not yet captured as of the calculation ⇒ ignored, whatever the publication date.
    expect(evidenceWeight(ev({ observedAt: daysAgo(-1), publishedAt: daysAgo(30) }), asOf)).toBe(0);
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
      fx,
    };
    const q = byDim(input).QUALITY;
    expect(q.value).toBe(75);
    expect(q.confidence).toBe(0.393);
  });

  it("more evidence raises confidence and moves the score away from neutral", () => {
    const one = [ev({ metric: "RATING", metricValue: 4.8 })];
    const many = [...one, ...Array.from({ length: 6 }, () => ev({ metric: "RATING", metricValue: 4.8 }))];
    const a = byDim({ asOf, evidence: one, offers: [], categoryBestPrices: [], fx }).QUALITY;
    const b = byDim({ asOf, evidence: many, offers: [], categoryBestPrices: [], fx }).QUALITY;
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
    const latestOnly = byDim({ asOf, evidence: [again[2]], offers: [], categoryBestPrices: [], fx }).QUALITY;
    const resubmitted = byDim({ asOf, evidence: again, offers: [], categoryBestPrices: [], fx }).QUALITY;
    expect(resubmitted).toEqual(latestOnly); // three captures score exactly like one
    expect(resubmitted.evidenceIds).toEqual([again[2].id]); // only the latest capture is cited
  });

  // Ad Momentum (v2.0.0): snapshots of the active Meta ads that match the product.
  const ads = (vals: number[], stepDays = 30) =>
    vals.map((v, i) =>
      ev({
        metric: "AD_ACTIVE_ADS",
        metricValue: v,
        sourceType: "AD_LIBRARY",
        sourceUrl: "https://www.facebook.com/ads/library/?q=silicone%20utensil",
        observedAt: daysAgo((vals.length - 1 - i) * stepDays),
      }),
    );

  it("TREND is high when active ads are rising (RISING) and low when they're falling (FALLING)", () => {
    const up = byDim({ asOf, evidence: ads([10, 12, 14]), offers: [], categoryBestPrices: [], fx }).TREND;
    const down = byDim({ asOf, evidence: ads([14, 12, 10]), offers: [], categoryBestPrices: [], fx }).TREND;
    const flat = byDim({ asOf, evidence: ads([12, 12, 12]), offers: [], categoryBestPrices: [], fx }).TREND;
    expect(up.value).toBeGreaterThanOrEqual(75); // about +17% a month
    expect(down.value).toBeLessThanOrEqual(25);
    expect(flat.value).toBe(50);
    expect(up.evidenceIds).toHaveLength(3); // every snapshot is cited
  });

  it("TREND reads the change as a share of the ad count: +10% a month scores 75", () => {
    // Two snapshots 30 days apart, 20 → 22 ads: +2 on a mean of about 21 ≈ +9.5% a month.
    const t = byDim({ asOf, evidence: ads([20, 22]), offers: [], categoryBestPrices: [], fx }).TREND;
    expect(t.value).toBeGreaterThan(72);
    expect(t.value).toBeLessThan(76);
  });

  it("TREND is blank, not a neutral 50, with no ads seen or too little history", () => {
    expect(byDim({ asOf, evidence: ads([0, 0, 0]), offers: [], categoryBestPrices: [], fx }).TREND).toBeUndefined();
    expect(byDim({ asOf, evidence: ads([5]), offers: [], categoryBestPrices: [], fx }).TREND).toBeUndefined();
    expect(byDim({ asOf, evidence: ads([5, 9], 3), offers: [], categoryBestPrices: [], fx }).TREND).toBeUndefined(); // 3 days apart
  });

  it("TREND no longer comes from Google Trends search interest", () => {
    const interest = [40, 50, 60].map((v, i) =>
      ev({ metric: "SEARCH_INTEREST", metricValue: v, sourceUrl: "https://trends.test/x", observedAt: daysAgo(60 - i * 30) }),
    );
    expect(byDim({ asOf, evidence: interest, offers: [], categoryBestPrices: [], fx }).TREND).toBeUndefined();
  });

  it("DEMAND ignores search interest, which is relative to each keyword's own peak", () => {
    const reviews = ev({ metric: "REVIEW_COUNT", metricValue: 1200 });
    const interest = [90, 95, 100].map((v, i) =>
      ev({ metric: "SEARCH_INTEREST", metricValue: v, sourceUrl: "https://trends.test/x", observedAt: daysAgo(60 - i * 30) }),
    );
    const without = byDim({ asOf, evidence: [reviews], offers: [], categoryBestPrices: [], fx });
    const withInterest = byDim({ asOf, evidence: [reviews, ...interest], offers: [], categoryBestPrices: [], fx });
    expect(withInterest.DEMAND).toEqual(without.DEMAND);
    expect(withInterest.TREND).toBeUndefined(); // nor TREND, since v2.0.0
    expect(byDim({ asOf, evidence: interest, offers: [], categoryBestPrices: [], fx }).DEMAND).toBeUndefined();
  });


  it("VALUE rewards a cheaper price at equal quality and needs category peers", () => {
    const rating = ev({ metric: "RATING", metricValue: 4.5 });
    const src = ev({ sourceType: "RETAILER" });
    const peers = [{ currency: "USD", price: 100 }, { currency: "USD", price: 200 }];
    const cheap = byDim({ asOf, evidence: [rating, src], offers: [offer(100, src.id)], categoryBestPrices: peers, fx }).VALUE;
    const dear = byDim({ asOf, evidence: [rating, src], offers: [offer(200, src.id)], categoryBestPrices: peers, fx }).VALUE;
    expect(cheap.value).toBeGreaterThan(dear.value);
    expect(cheap.evidenceIds).toContain(src.id);

    const alone = byDim({ asOf, evidence: [rating, src], offers: [offer(100, src.id)], categoryBestPrices: [peers[0]], fx });
    expect(alone.VALUE).toBeUndefined();
  });

  it("VALUE ignores out-of-stock and stale offers", () => {
    const rating = ev({ metric: "RATING", metricValue: 4.5 });
    const src = ev({ sourceType: "RETAILER" });
    const peers = [{ currency: "USD", price: 100 }, { currency: "USD", price: 200 }];
    const offers = [offer(10, src.id, { availability: "OUT_OF_STOCK" }), offer(5, src.id, { observedAt: daysAgo(45) })];
    expect(byDim({ asOf, evidence: [rating, src], offers, categoryBestPrices: peers, fx }).VALUE).toBeUndefined();
  });

  it("picks the cheapest offer across currencies in euros, keeping its own price", () => {
    const usd = offer(30, "a"); // 24 EUR
    const gbp = offer(20, "b", { currency: "GBP" }); // 25 EUR — the smaller number, but dearer
    expect(bestCurrentOffer([usd, gbp], asOf, fx)).toEqual(usd);
    expect(bestCurrentOffer([offer(20, "c", { currency: "GBP" }), offer(25, "d", { currency: "GBP" })], asOf, fx)?.price).toBe(20);
  });

  it("uses each store's newest price, never an older, cheaper capture of it (v1.5.0)", () => {
    // lookfantastic sold it at 15 three days ago and at 20 today; another store sells it at 18.
    const was = offer(15, "a", { merchant: "lookfantastic.com", observedAt: daysAgo(3) });
    const now = offer(20, "b", { merchant: "lookfantastic.com", observedAt: daysAgo(0) });
    const other = offer(18, "c", { merchant: "spacenk.com", observedAt: daysAgo(2) });
    expect(bestCurrentOffer([was, now, other], asOf, fx)).toEqual(other);
    expect(bestCurrentOffer([was, now], asOf, fx)).toEqual(now);
  });

  it("drops a store whose newest capture is sold out, instead of using its older price", () => {
    const inStock = offer(15, "a", { merchant: "shop.test", observedAt: daysAgo(3) });
    const soldOut = offer(15, "b", { merchant: "shop.test", observedAt: daysAgo(1), availability: "OUT_OF_STOCK" });
    expect(bestCurrentOffer([inStock, soldOut], asOf, fx)).toBeNull();
  });

  it("skips offers in a currency without a rate, unless every offer uses it", () => {
    const aed = offer(10, "a", { currency: "AED" });
    const usd = offer(100, "b");
    expect(bestCurrentOffer([aed, usd], asOf, fx)).toEqual(usd);
    expect(bestCurrentOffer([aed, offer(12, "c", { currency: "AED" })], asOf, fx)).toEqual(aed);
  });

  it("VALUE compares a price with category peers in other currencies", () => {
    const rating = ev({ metric: "RATING", metricValue: 4.5 });
    const src = ev({ sourceType: "RETAILER" });
    const peersEur100 = [{ currency: "GBP", price: 80 }, { currency: "EUR", price: 100 }]; // both 100 EUR
    const sameAsPeers = byDim({ asOf, evidence: [rating, src], offers: [offer(125, src.id)], categoryBestPrices: peersEur100, fx }).VALUE;
    const usdOnly = byDim({ asOf, evidence: [rating, src], offers: [offer(125, src.id)], categoryBestPrices: [{ currency: "USD", price: 125 }, { currency: "USD", price: 125 }], fx }).VALUE;
    expect(sameAsPeers).toEqual(usdOnly); // 125 USD = 100 EUR: the same price, so the same VALUE

    const noRate = [{ currency: "AED", price: 10 }, { currency: "USD", price: 125 }];
    expect(byDim({ asOf, evidence: [rating, src], offers: [offer(125, src.id)], categoryBestPrices: noRate, fx }).VALUE).toBeUndefined();
  });

  it("OVERALL penalises confidence for missing dimensions and stays in range", () => {
    const evidence = [ev({ metric: "RATING", metricValue: 5, qualityScore: 100, observedAt: asOf })];
    const s = byDim({ asOf, evidence, offers: [], categoryBestPrices: [], fx });
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

describe("fx", () => {
  it("converts to euros and knows EUR without a rate", () => {
    expect(toEur(125, "USD", fx)).toBe(100);
    expect(toEur(9, "EUR", fx)).toBe(9);
    expect(toEur(9, "AED", fx)).toBeNull();
  });

  it("reads the ECB daily feed", () => {
    const currencies = ["USD", "JPY", "GBP", "CHF", "AUD", "CAD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "ISK", "TRY",
      "BRL", "CNY", "HKD", "IDR", "ILS", "INR", "KRW", "MXN", "MYR", "NZD", "PHP", "SGD", "THB", "ZAR"];
    const xml = `<gesmes:Envelope><Cube><Cube time='2026-10-12'>${currencies.map((c, i) => `<Cube currency='${c}' rate='${1 + i / 10}'/>`).join("")}</Cube></Cube></gesmes:Envelope>`;
    const parsed = parseEcbDaily(xml);
    expect(parsed.date).toBe("2026-10-12");
    expect(Object.keys(parsed.perEur)).toHaveLength(29);
    expect(parsed.perEur.USD).toBe(1);
    expect(() => parseEcbDaily("<html>maintenance</html>")).toThrow();
  });
});
