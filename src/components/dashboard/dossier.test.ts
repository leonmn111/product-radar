import { describe, expect, it } from "vitest";
import type { ProductDto } from "@/server/products/service";
import {
  cleanTitle,
  estimateProfit,
  opportunityVerdict,
  parseMoney,
  shopifyCsv,
  type ShopifyProduct,
  sourcingKeywords,
  startingWholesale,
  supplierSearchUrls,
} from "./dossier";
import { marginInsight } from "@/server/margins/engine";
import { LATEST_FX } from "@/server/scoring/fx-latest";

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
    rrp: null,
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
  const at = new Date("2026-10-11T14:30:00.000Z");
  const offer = (id: string, merchant: string, price: number) => ({
    id,
    merchant,
    url: `https://${merchant}/buds`,
    price: { amount: price.toFixed(2), currency: "GBP" },
    availability: "IN_STOCK" as const,
    observedAt: at.toISOString(),
    sourceEvidenceId: `e-${id}`,
    rrp: null,
  });
  const cheap = offer("o1", "cheap.test", 15);
  const dear = offer("o2", "dear.test", 20);
  // A real margin insight for a £15 / £20 price gap between two stores.
  const gap = marginInsight({
    category: "wireless-earbuds",
    offers: [cheap, dear].map((o) => ({ ...o, price: Number(o.price.amount), currency: "GBP", observedAt: at, qualityScore: 80 })),
    asOf: at,
    fx: LATEST_FX,
  });
  const base = {
    id: "0199a0a0-0000-7000-8000-00000c406b2f",
    name: "Men's Tree Runners | Allbirds",
    brand: "Allbirds",
    description: 'Light "comfy" shoes.\n\n<b>Machine</b> washable.',
    category: "shoes",
    imageUrl: "https://cdn.test/runners.jpg",
    bestOffer: cheap,
    margin: gap,
    rrp: null as ShopifyProduct["rrp"],
    merchant: "Allbirds",
  };
  const rrpOf = (amount: string, currency = "GBP") => ({
    amount,
    currency,
    merchant: "rrp.test",
    url: "https://rrp.test/buds",
    observedAt: at.toISOString(),
    evidenceId: "e-rrp",
  });
  const rows = (csv: string) => {
    const [header, row] = csv.trim().split("\r\n");
    return { header, cells: Object.fromEntries(header.slice(1, -1).split('","').map((h, k) => [h, row.split('","')[k].replace(/^"|"$/g, "")])) };
  };

  it("uses Shopify's classic import headers, as a draft", () => {
    const { header } = rows(shopifyCsv(base));
    expect(header).toBe(
      '"Handle","Title","Body (HTML)","Vendor","Type","Tags","Published","Option1 Name","Option1 Value","Variant SKU","Variant Price","Variant Compare At Price","Image Src","Cost per item","Status"',
    );
  });

  it("fills every column from the product's own data", () => {
    const { cells } = rows(shopifyCsv(base));
    expect(cells).toEqual({
      Handle: "men-s-tree-runners",
      Title: "Men's Tree Runners",
      "Body (HTML)": "<p>Light &quot;comfy&quot; shoes.</p><p>&lt;b&gt;Machine&lt;/b&gt; washable.</p>",
      Vendor: "Allbirds",
      Type: "Shoes",
      Tags: "Shoes, ProductRadar",
      Published: "FALSE",
      "Option1 Name": "Title",
      "Option1 Value": "Default Title",
      "Variant SKU": "PR-0C406B2F",
      "Variant Price": "20.00", // the going price at other stores (the margin engine's resale price)
      "Variant Compare At Price": "", // no RRP is captured, and a store's lower price would read as a price rise
      "Image Src": "https://cdn.test/runners.jpg",
      "Cost per item": startingWholesale(gap)!.toFixed(2),
      Status: "draft",
    });
  });

  it("never puts a price at or below the selling price in compare-at", () => {
    for (const margin of [gap, null]) {
      const { cells } = rows(shopifyCsv({ ...base, margin }));
      const compareAt = cells["Variant Compare At Price"];
      expect(compareAt === "" || Number(compareAt) > Number(cells["Variant Price"])).toBe(true);
    }
  });

  it("uses the highest RRP found as compare-at, but only when it's above the price", () => {
    expect(rows(shopifyCsv({ ...base, rrp: rrpOf("25.00") })).cells["Variant Compare At Price"]).toBe("25.00");
    expect(rows(shopifyCsv({ ...base, rrp: rrpOf("20.00") })).cells["Variant Compare At Price"]).toBe(""); // equal to the price
    expect(rows(shopifyCsv({ ...base, rrp: rrpOf("18.00") })).cells["Variant Compare At Price"]).toBe(""); // below it
    expect(rows(shopifyCsv({ ...base, rrp: rrpOf("25.00", "USD") })).cells["Variant Compare At Price"]).toBe(""); // other currency
  });

  it("prices at the best price, with no compare-at, when there's no price gap", () => {
    const single = marginInsight({
      category: "wireless-earbuds",
      offers: [{ ...cheap, price: 15, currency: "GBP", observedAt: at, qualityScore: 80 }],
      asOf: at,
      fx: LATEST_FX,
    });
    const { cells } = rows(shopifyCsv({ ...base, margin: single }));
    expect(cells["Variant Price"]).toBe("15.00");
    expect(cells["Variant Compare At Price"]).toBe("");
  });

  it("never mixes currencies between the price and the compare-at price", () => {
    const usd = { ...cheap, price: { amount: "18.00", currency: "USD" } };
    const { cells } = rows(shopifyCsv({ ...base, bestOffer: usd }));
    expect(cells["Variant Price"]).toBe("18.00");
    expect(cells["Variant Compare At Price"]).toBe("");
    expect(cells["Cost per item"]).toBe(""); // the wholesale estimate is in GBP
  });

  it("leaves prices and cost empty without an offer, and takes the seller's own cost when given", () => {
    const { cells } = rows(shopifyCsv({ ...base, bestOffer: null, margin: null, imageUrl: null }));
    expect([cells["Variant Price"], cells["Variant Compare At Price"], cells["Cost per item"], cells["Image Src"]]).toEqual(["", "", "", ""]);
    expect(rows(shopifyCsv(base, { costPerItem: 7.5 })).cells["Cost per item"]).toBe("7.50");
  });

  it("escapes store text exactly once, even when the store already encoded it", () => {
    const { cells } = rows(shopifyCsv({ ...base, description: "Use AM &amp;amp; PM &#8211; <i>daily</i> &copy;" }));
    expect(cells["Body (HTML)"]).toBe("<p>Use AM &amp; PM – &lt;i&gt;daily&lt;/i&gt; &amp;copy;</p>");
  });

  it("drops trademark symbols from the handle", () => {
    expect(shopifyCsv({ ...base, name: "Loop Quiet™ 2", merchant: null })).toContain('"loop-quiet-2","Loop Quiet™ 2"');
  });

  it("neutralises spreadsheet formulas in scraped text", () => {
    expect(shopifyCsv({ ...base, name: "=HYPERLINK(1)", merchant: null })).toContain(`"'=HYPERLINK(1)"`);
  });
});
