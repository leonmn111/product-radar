import { describe, expect, it } from "vitest";
import type { ProductDto } from "@/server/products/service";
import { buildDossier } from "./dossier";

const score = (value: number, confidence: number) => ({
  value,
  confidence,
  methodologyVersion: "1.1.0",
  calculatedAt: "2026-10-01T00:00:00.000Z",
  evidenceIds: ["e1", "e2"],
});

const evidence = [
  {
    id: "e1",
    claim: "Rated 4.6 out of 5",
    source: { name: "Shop", url: "https://shop.test/buds", type: "MARKETPLACE" as const },
    observedAt: "2026-09-30T00:00:00.000Z",
    publishedAt: null,
    qualityScore: 80,
    metric: { type: "RATING" as const, value: 4.6 },
    isSample: false,
  },
  {
    id: "e2",
    claim: "Price £40.00",
    source: { name: "Shop", url: "https://shop.test/buds", type: "MARKETPLACE" as const },
    observedAt: "2026-09-30T00:00:00.000Z",
    publishedAt: null,
    qualityScore: 80,
    metric: null,
    isSample: false,
  },
];

const offer = {
  id: "o1",
  merchant: "Shop",
  url: "https://shop.test/buds",
  price: { amount: "40.00", currency: "GBP" },
  availability: "IN_STOCK" as const,
  observedAt: "2026-09-30T00:00:00.000Z",
  sourceEvidenceId: "e2",
};

const product = (over: Partial<ProductDto> = {}) =>
  ({
    id: "0199a0a0-0000-7000-8000-000000000001",
    slug: "kestrel-buds",
    name: "Kestrel Buds Pro | Shop",
    brand: "Kestrel",
    category: "wireless-earbuds",
    description: "Small buds.",
    isSample: false,
    bestOffer: offer,
    scores: { OVERALL: score(66, 0.72), QUALITY: score(70, 0.8), DEMAND: score(40, 0.25) },
    offers: [offer],
    evidenceCount: evidence.length,
    evidence,
    ...over,
  }) as ProductDto;

describe("agent dossier", () => {
  const d = buildDossier(product(), new Date("2026-10-09T00:00:00.000Z"));

  it("labels the verdict as a rule-based estimate with its confidence", () => {
    expect(d.verdict).toMatchObject({ method: "rule-based", confidence: 0.72, confidenceLevel: "high", sourceCount: 2 });
    expect(d.verdict!.summary.length).toBeGreaterThan(20);
    expect(d.disclaimer).toMatch(/estimates/);
  });

  it("cites a source, timestamp and quality score for every piece of evidence", () => {
    expect(d.evidence.count).toBe(2);
    for (const e of d.evidence.items) {
      expect(e.sourceUrl).toMatch(/^https:\/\//);
      expect(e.observedAt).toBeTruthy();
      expect(typeof e.qualityScore).toBe("number");
    }
  });

  it("reports every score with confidence and the evidence it used", () => {
    expect(Object.keys(d.scores).sort()).toEqual(["demand", "overall", "quality"]);
    expect(d.scores.demand).toMatchObject({ value: 40, confidenceLevel: "low", evidenceIds: ["e1", "e2"] });
  });

  it("estimates profit from the observed price and states its assumptions", () => {
    expect(d.profitEstimate).toMatchObject({
      currency: "GBP",
      retailPrice: 40,
      retailPriceSource: { merchant: "Shop", url: "https://shop.test/buds" },
      assumedWholesaleCost: 12,
      netProfitPerUnit: 28,
      marginPct: 70,
    });
    expect(d.profitEstimate!.assumptions.join(" ")).toMatch(/30%.*not included/);
  });

  it("strips the store name from the title and builds supplier searches and a Shopify draft", () => {
    expect(d.product.name).toBe("Kestrel Buds Pro");
    expect(d.sourcing.searchUrls.aliexpress).toContain("aliexpress.com");
    expect(d.shopifyImportCsv).toContain('"draft"');
  });

  it("gives no profit estimate without a current price, and no verdict without an overall score", () => {
    const bare = buildDossier(product({ bestOffer: null, offers: [], scores: {} }));
    expect(bare.profitEstimate).toBeNull();
    expect(bare.verdict).toBeNull();
  });
});
