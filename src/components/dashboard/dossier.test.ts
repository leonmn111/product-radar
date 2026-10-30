import { describe, expect, it } from "vitest";
import type { ProductDto } from "@/server/products/service";
import {
  cleanTitle,
  opportunityVerdict,
  parseMoney,
  shopifyCsv,
  type ShopifyProduct,
  sourcingKeywords,
  supplierSearchUrls,
} from "./dossier";
import { SHOPIFY_PLACEHOLDER_BODY } from "@/engine/exports";
import { calculateUKMargin } from "@/engine/margin";
import { catalogResellability } from "@/services/catalogMargin";
import { resaleRisk } from "./resellability";
import { marginInsight } from "@/server/margins/engine";
import { LATEST_FX } from "@/server/scoring/fx-latest";

const score = (value: number, confidence = 0.7) => ({
  value,
  confidence,
  methodologyVersion: "1.1.0",
  calculatedAt: "2026-10-01T00:00:00.000Z",
  evidenceIds: ["a", "b", "c"],
  sourceCount: 2, // two of the three items are the same page, read twice
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
    resellable: true,
    resaleRisk: null,
    margin: null,
    scores,
    offers: [],
    evidenceCount: evidence.length,
    sourceCount: evidence.length,
    hasSearchTrend: false,
    evidence,
  } as ProductDto;
}

// A landed margin as the dossier's catalogMargin service shows it: sourced price and supplier cost, plus
// whatever else is known. Every other cost is named as excluded.
const landed = (retail: number, supplier: number, extra: Partial<Parameters<typeof calculateUKMargin>[0]> = {}) => {
  const cost = (amount: number) => ({ amount, basis: "sourced" as const, evidenceIds: [`e-${amount}`] });
  const value = calculateUKMargin({ retailPrice: cost(retail), supplierCost: cost(supplier), shipping: null, returns: null, adCostPerSale: null, ...extra });
  return { margin: { status: "shown" as const, confidence: 0.8, value, evidenceIds: value.evidenceIds } };
};
const strongScores = { OVERALL: score(64.9), QUALITY: score(68.7), VALUE: score(84), DEMAND: score(48), TREND: score(49) };

describe("opportunity verdict: the four tiers", () => {
  it("says Not enough evidence without an overall score", () => {
    const v = opportunityVerdict(product({}));
    expect([v.kind, v.label]).toEqual(["WITHHELD", "Not enough evidence"]);
  });

  it("says Not enough evidence below the 0.5 verdict gate, whatever the scores", () => {
    const v = opportunityVerdict(product({ OVERALL: score(80, 0.2), QUALITY: score(90) }));
    expect([v.kind, v.label]).toEqual(["WITHHELD", "Not enough evidence"]);
    expect(v.sentences[1]).toContain("20% confidence; a verdict needs 50%");
  });

  it("gives strong signals without a proven profit Test small, never Launch", () => {
    const v = opportunityVerdict(product(strongScores));
    expect([v.kind, v.label]).toEqual(["TEST", "Test small"]);
    expect(v.sentences[0]).toBe("Buyers rate it 4.5/5 (1 source), it has about 12,400 reviews and its ad momentum (active Meta ads) is steady.");
    expect(v.sentences[1]).toMatch(/the profit isn't proven yet/);
    // A profit before ads, but shipping and returns not counted yet: still Test small.
    const partial = opportunityVerdict(product(strongScores), landed(22.24, 3.5));
    expect(partial.kind).toBe("TEST");
    expect(partial.sentences[1]).toMatch(/keeps £10\.08 per sale before ads \(45\.3% of the price\), and some costs aren't counted yet \(Shipping per unit, Returns allowance\)/);
  });

  it("launches only with strong signals and a proven profit, every cost accounted for", () => {
    const known = (amount: number) => ({ amount, basis: "caller_supplied" as const, evidenceIds: [] });
    const full = landed(30, 3, { shipping: known(2), returns: { returnRate: 0.05, costPerReturn: 5, basis: "caller_supplied", evidenceIds: [] }, adCostPerSale: known(2) });
    expect(full.margin.value.complete).toBe(true);
    const v = opportunityVerdict(product(strongScores), full);
    expect([v.kind, v.label, v.gate]).toEqual(["LAUNCH", "Launch", null]);
    expect(v.sentences[1]).toMatch(/keeps £11\.25 per sale \(37\.5% of the price, 225% return on cost\)/);
  });

  it("flags proven demand at an uncompetitive price as Avoid (crowded market)", () => {
    const v = opportunityVerdict(product({ OVERALL: score(64), QUALITY: score(74), VALUE: score(52), DEMAND: score(63.5) }));
    expect([v.kind, v.label, v.gate]).toEqual(["AVOID", "Avoid", null]);
    expect(v.sentences[1]).toMatch(/^Crowded market/);
  });

  it("names the specific risks", () => {
    const v = opportunityVerdict(product({ OVERALL: score(52), QUALITY: score(59), DEMAND: score(45), TREND: score(20) }, [metric("SEARCH_INTEREST", 40)]));
    expect(v.kind).toBe("TEST");
    // Search interest is a plain fact now; the direction is Ad Momentum (TREND, scoring v2.0.0).
    expect(v.sentences[0]).toBe("Search interest is 40/100 and its ad momentum (active Meta ads) is falling.");
    expect(v.sentences[1]).toBe("The main risks: ad momentum is falling, ratings are only middling and demand signals are weak. Test with a small order before committing.");
  });

  it("uses only the latest capture per source for ratings", () => {
    const ev = [metric("RATING", 3.0, "2026-09-01T00:00:00.000Z"), { ...metric("RATING", 4.0), source: { name: "S", url: "https://s.test/RATING/1", type: "REVIEW" as const } }];
    ev[0].source.url = "https://s.test/RATING/1";
    expect(opportunityVerdict(product({ OVERALL: score(55) }, ev)).sentences[0]).toBe("Buyers rate it 4.0/5 (1 source).");
  });
});

describe("opportunity verdict: the hard gates", () => {
  it("G1: a loss before ads on the cheapest modelled channel is Avoid, whatever the scores", () => {
    const loss = landed(10, 9); // £10 retail: VAT £1.67 and TikTok Shop fees £2.50 leave £5.83, less a £9 supplier cost
    expect(loss.margin.value.breakEvenAdCost.amount).toBe(-3.17);
    const cases: Record<string, ReturnType<typeof score>>[] = [strongScores, { OVERALL: score(80, 0.2) }, {}];
    for (const scores of cases) {
      const v = opportunityVerdict(product(scores), loss);
      expect([v.kind, v.label, v.gate]).toEqual(["AVOID", "Avoid", "G1_PROFIT"]);
      expect(v.sentences[1]).toMatch(/^Loses £3\.17 per sale before ads: it sells for £10\.00/);
    }
  });

  it("G1: breaking even before ads (£0) is Avoid too", () => {
    const even = landed(10, 5.83);
    expect(even.margin.value.breakEvenAdCost.amount).toBe(0);
    expect(opportunityVerdict(product(strongScores), even).sentences[1]).toMatch(/^Loses £0\.00 per sale before ads/);
  });

  it("G3: a branded product is Avoid (brand-restricted), whatever its scores, evidence or margin", () => {
    const v = opportunityVerdict({ ...product(strongScores), resaleRisk: "ip" }, landed(30, 3));
    expect([v.kind, v.label, v.gate]).toEqual(["AVOID", "Avoid (brand-restricted)", "G3_BRAND"]);
    expect(opportunityVerdict({ ...product({}), resaleRisk: "ip" }).label).toBe("Avoid (brand-restricted)");
  });

  // Regression: the INKEY moisturiser, a real catalog product, was rated "High Potential" despite its brand.
  it("G3 regression: the INKEY moisturiser returns Avoid", () => {
    const inkey = {
      ...product(strongScores),
      name: "The INKEY List Bio-Active Ceramide Moisturiser",
      brand: "The INKEY List UK",
      category: "beauty",
      description: "A rich moisturiser with ceramides and peptides that repairs and plumps the skin barrier.",
    };
    const risk = resaleRisk(catalogResellability(inkey));
    expect(risk).toBe("ip");
    const v = opportunityVerdict({ ...inkey, resaleRisk: risk }, landed(15, 2.13));
    expect(v.kind).toBe("AVOID");
    expect(v.label).toBe("Avoid (brand-restricted)");
    expect(v.sentences[1]).toMatch(/^Brand-restricted/);
  });
});

describe("money inputs", () => {
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
    source: { quality: 80, type: "RETAILER" as const, claim: `£${price.toFixed(2)} at ${merchant}` },
    rrp: null,
  });
  const cheap = offer("o1", "cheap.test", 15);
  const dear = offer("o2", "dear.test", 20);
  // A real margin insight for a £15 / £20 price gap between two stores.
  const gap = marginInsight({
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
      "Body (HTML)": SHOPIFY_PLACEHOLDER_BODY, // never the brand's own copy
      Vendor: "Allbirds",
      Type: "Shoes",
      Tags: "Shoes, ProductRadar",
      Published: "FALSE",
      "Option1 Name": "Title",
      "Option1 Value": "Default Title",
      "Variant SKU": "PR-0C406B2F",
      "Variant Price": "20.00", // the going price at other stores (the margin engine's resale price)
      "Variant Compare At Price": "", // no RRP is captured, and a store's lower price would read as a price rise
      "Image Src": "", // never the brand's photo
      "Cost per item": "", // never estimated: only the seller's own supplier cost goes here
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
  });

  it("leaves prices and cost empty without an offer, and takes the seller's own cost when given", () => {
    const { cells } = rows(shopifyCsv({ ...base, bestOffer: null, margin: null, imageUrl: null }));
    expect([cells["Variant Price"], cells["Variant Compare At Price"], cells["Cost per item"], cells["Image Src"]]).toEqual(["", "", "", ""]);
    expect(rows(shopifyCsv(base, { costPerItem: 7.5 })).cells["Cost per item"]).toBe("7.50");
  });

  it("never copies the brand's description or photo, whatever the store page held", () => {
    const csv = shopifyCsv({ ...base, description: "Our signature <b>wool</b> runner, made by Allbirds.", imageUrl: "https://cdn.allbirds.test/runner.jpg" });
    expect(csv).not.toMatch(/signature|cdn\.allbirds/);
    expect(rows(csv).cells["Body (HTML)"]).toBe(SHOPIFY_PLACEHOLDER_BODY);
  });

  it("drops trademark symbols from the handle", () => {
    expect(shopifyCsv({ ...base, name: "Loop Quiet™ 2", merchant: null })).toContain('"loop-quiet-2","Loop Quiet™ 2"');
  });

  it("neutralises spreadsheet formulas in scraped text", () => {
    expect(shopifyCsv({ ...base, name: "=HYPERLINK(1)", merchant: null })).toContain(`"'=HYPERLINK(1)"`);
  });
});
