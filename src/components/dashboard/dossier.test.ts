import { describe, expect, it } from "vitest";
import type { ProductDto } from "@/server/products/service";
import {
  cleanTitle,
  estimateProfit,
  opportunityVerdict,
  parseMoney,
  shopifyCsv,
  sourcingKeywords,
  startingWholesale,
  supplierSearchUrls,
} from "./dossier";

const score = (value: number, confidence = 0.7) => ({
  value,
  confidence,
  methodologyVersion: "1.1.0",
  calculatedAt: "2026-10-01T00:00:00.000Z",
  evidenceIds: ["a", "b", "c"],
});

let n = 0;
const metric = (type: "RATING" | "REVIEW_COUNT" | "SEARCH_INTEREST", value: number, observedAt = "2026-09-30T00:00:00.000Z") => ({
  id: String(++n),
  claim: "x",
  source: { name: "S", url: `https://s.test/${type}/${n}`, type: "REVIEW" as const },
  observedAt,
  publishedAt: null,
  qualityScore: 80,
  metric: { type, value },
  isSample: true,
});

function product(scores: Record<string, ReturnType<typeof score>>, evidence = [metric("RATING", 4.5), metric("REVIEW_COUNT", 12_400)]) {
  return {
    id: "p",
    slug: "p",
    name: "Kestrel Buds Lite",
    brand: "Kestrel (sample)",
    category: "wireless-earbuds",
    description: null,
    imageUrl: null,
    isSample: true,
    bestOffer: null,
    margin: null,
    scores,
    offers: [],
    evidenceCount: evidence.length,
    sourceCount: evidence.length,
    hasSearchTrend: false,
    evidence,
  } as ProductDto;
}

describe("opportunity verdict", () => {
  it("gives no verdict without an overall score", () => {
    expect(opportunityVerdict(product({}))).toBeNull();
  });

  it("rates strong quality, value and demand as High Potential", () => {
    const v = opportunityVerdict(product({ OVERALL: score(64.9), QUALITY: score(68.7), VALUE: score(84), DEMAND: score(48), TREND: score(49) }))!;
    expect(v.kind).toBe("HIGH_POTENTIAL");
    expect(v.sentences[0]).toBe("Buyers rate it 4.5/5 (1 source) and it has about 12,400 reviews.");
  });

  it("flags proven demand at an uncompetitive price as Crowded Market", () => {
    const v = opportunityVerdict(product({ OVERALL: score(64), QUALITY: score(74), VALUE: score(52), DEMAND: score(63.5) }))!;
    expect(v.kind).toBe("CROWDED_MARKET");
  });

  it("never goes above Moderate Risk on thin evidence", () => {
    const v = opportunityVerdict(product({ OVERALL: score(80, 0.2), QUALITY: score(90) }))!;
    expect(v.kind).toBe("MODERATE_RISK");
    expect(v.sentences[1]).toContain("20% confidence");
  });

  it("names the specific risks", () => {
    const v = opportunityVerdict(product({ OVERALL: score(52), QUALITY: score(59), DEMAND: score(45), TREND: score(36) }, [metric("SEARCH_INTEREST", 40)]))!;
    expect(v.kind).toBe("MODERATE_RISK");
    expect(v.sentences[0]).toBe("Search interest is 40/100 and falling.");
    expect(v.sentences[1]).toBe("The main risks: search interest is falling, ratings are only middling and demand signals are weak.");
  });

  it("uses only the latest capture per source for ratings", () => {
    const ev = [metric("RATING", 3.0, "2026-09-01T00:00:00.000Z"), { ...metric("RATING", 4.0), source: { name: "S", url: "https://s.test/RATING/1", type: "REVIEW" as const } }];
    ev[0].source.url = "https://s.test/RATING/1";
    expect(opportunityVerdict(product({ OVERALL: score(55) }, ev))!.sentences[0]).toBe("Buyers rate it 4.0/5 (1 source).");
  });
});

describe("profit estimate", () => {
  it("starts wholesale at the middle of the Census-based estimate, and computes net profit and margin", () => {
    const margin = { wholesaleEstimate: { low: 39.28, high: 46.32 } } as ProductDto["margin"];
    expect(startingWholesale(margin)).toBe(42.8);
    expect(startingWholesale(null)).toBeNull();
    expect(estimateProfit(59, 17.7, 10)).toEqual({ net: 31.3, marginPct: 53.1 });
    expect(estimateProfit(20, 15, 10)).toEqual({ net: -5, marginPct: -25 });
  });

  it("parses money inputs leniently and rejects negatives", () => {
    expect(parseMoney("£1,234.50")).toBe(1234.5);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("-3")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
});

describe("supplier keywords", () => {
  it("strips store tags and categories from marketplace titles", () => {
    expect(cleanTitle("Soundcore P20i True Wireless Earbuds, 10mm Drivers : Amazon.co.uk: Electronics & Photo")).toBe(
      "Soundcore P20i True Wireless Earbuds, 10mm Drivers",
    );
    expect(cleanTitle("Amazon.co.uk: Soundcore P20i Earbuds")).toBe("Soundcore P20i Earbuds");
    expect(cleanTitle("Men's Tree Runners | Allbirds", "Allbirds")).toBe("Men's Tree Runners");
    expect(cleanTitle("Amazon.co.uk")).toBe("Amazon.co.uk");
  });

  it("removes brand names, brackets and feature lists", () => {
    expect(
      sourcingKeywords({
        name: "Anker Soundcore P20i True Wireless Earbuds (Black), 10mm Drivers with Big Bass : Amazon.co.uk: Electronics",
        brand: "Anker",
        category: "wireless-earbuds",
        merchant: "Amazon.co.uk",
      }),
    ).toBe("Soundcore P20i True Wireless Earbuds");
    expect(sourcingKeywords({ name: "Caffè Uno Manual Lever", brand: "Caffè Uno (sample)", category: "espresso-machines" })).toBe(
      "Manual Lever espresso machines",
    );
    expect(sourcingKeywords({ name: "Kestrel Buds Lite", brand: "Kestrel (sample)", category: "wireless-earbuds" })).toBe(
      "Buds Lite wireless earbuds",
    );
  });

  it("builds search URLs with the keywords encoded", () => {
    expect(supplierSearchUrls("Men's earbuds & case")).toEqual({
      aliexpress: "https://www.aliexpress.com/wholesale?SearchText=Men's+earbuds+%26+case",
      alibaba: "https://www.alibaba.com/trade/search?SearchText=Men's+earbuds+%26+case",
    });
  });
});

describe("Shopify CSV", () => {
  it("exports a draft product with the current Shopify headers", () => {
    const csv = shopifyCsv(
      { name: "Men's Tree Runners | Allbirds", description: 'Light "comfy" shoes.\n\n<b>Machine</b> washable.', category: "shoes", merchant: "Allbirds" },
      { price: 105, costPerItem: 31.5 },
    );
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toBe(
      '"Title","URL handle","Description","Vendor","Type","Tags","Published on online store","Status","Price","Cost per item","Requires shipping"',
    );
    expect(row).toBe(
      '"Men\'s Tree Runners","men-s-tree-runners","<p>Light &quot;comfy&quot; shoes.</p><p>&lt;b&gt;Machine&lt;/b&gt; washable.</p>","","Shoes","Shoes, ProductRadar","false","draft","105.00","31.50","true"',
    );
  });

  it("drops trademark symbols from the URL handle", () => {
    expect(shopifyCsv({ name: "Loop Quiet™ 2", description: null, category: "earplugs" }, { price: 19.95, costPerItem: 5.99 })).toContain(
      '"Loop Quiet™ 2","loop-quiet-2"',
    );
  });

  it("neutralises spreadsheet formulas in scraped text", () => {
    const csv = shopifyCsv({ name: "=HYPERLINK(1)", description: null, category: "x" }, { price: null, costPerItem: null });
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
  });
});
