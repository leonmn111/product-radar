import { describe, expect, it } from "vitest";
import type { FxRates } from "@/server/scoring/fx";
import { CENSUS_GROSS_MARGIN_SOURCE, EBAY_FEE_SOURCE, MARKETPLACE_FEE, ownStoreFee, SHOPIFY_UK_FEE_SOURCE, SHOPIFY_US_FEE_SOURCE, STORE_TYPES } from "./benchmarks";
import { currentOffersByStore, marginInsight, resaleFee, type MarginOffer } from "./engine";

const asOf = new Date("2026-10-01T00:00:00Z");
// Round test rates (not real ones): 1 EUR = 1.25 USD = 0.80 GBP; no AED.
const fx: FxRates = { date: "2026-10-01", perEur: { USD: 1.25, GBP: 0.8 } };
const daysAgo = (d: number) => new Date(asOf.getTime() - d * 86_400_000);

let n = 0;
const offer = (merchant: string, price: number, over: Partial<MarginOffer> = {}): MarginOffer => ({
  merchant,
  url: `https://${merchant}/p`,
  price,
  currency: "USD",
  availability: "IN_STOCK",
  observedAt: daysAgo(2),
  sourceEvidenceId: `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`,
  qualityScore: 70,
  ...over,
});
const insight = (category: string, offers: MarginOffer[]) => marginInsight({ category, offers, asOf, fx });

describe("margin engine: wholesale range and spread", () => {
  it("gives nothing without a current retail price", () => {
    expect(insight("beauty", [])).toBeNull();
    expect(insight("beauty", [offer("a.test", 20, { availability: "OUT_OF_STOCK" })])).toBeNull();
    expect(insight("beauty", [offer("a.test", 20, { observedAt: daysAgo(31) })])).toBeNull();
  });

  it("derives the wholesale range from the category's Census store-type margins", () => {
    const m = insight("beauty", [offer("shop.test", 20, { currency: "GBP" })])!;
    // Health and personal care stores, 2018–2022: 28.3% – 32.9%.
    expect(m.benchmark).toMatchObject({ storeType: "Health and personal care stores", naicsCode: "4461", years: "2018–2022" });
    expect(m.benchmark.grossMarginPct).toEqual({ low: 28.3, high: 32.9 });
    expect(m.wholesaleEstimate).toEqual({ low: 13.42, high: 14.34 });
    expect(m.grossSpread).toEqual({ low: 5.66, high: 6.58, lowPct: 28.3, highPct: 32.9 });
    expect(m.currency).toBe("GBP");
    expect(m.benchmark.source).toEqual(CENSUS_GROSS_MARGIN_SOURCE);
  });

  it("uses the lowest current price as the retail price, with its evidence", () => {
    const cheap = offer("cheap.test", 80);
    const m = insight("running-shoes", [offer("dear.test", 100), cheap])!;
    expect(m.retailPrice).toMatchObject({ merchant: "cheap.test", price: 80, evidenceId: cheap.sourceEvidenceId, qualityScore: 70 });
    // Shoe stores 42.1% – 50.9%.
    expect(m.wholesaleEstimate).toEqual({ low: 39.28, high: 46.32 });
  });

  it("falls back to all retail stores for a category it doesn't know", () => {
    const m = insight("garden-gnomes", [offer("a.test", 100)])!;
    expect(m.benchmark.storeType).toBe(STORE_TYPES.allRetail.name);
    expect(m.benchmark.grossMarginPct).toEqual({ low: 32, high: 33.8 });
  });
});

describe("margin engine: arbitrage rating (eBay)", () => {
  it("is Retail Only with a single store", () => {
    const a = insight("gadgets", [offer("solo.test", 50)])!.arbitrage;
    expect(a).toMatchObject({ rating: "RETAIL_ONLY", label: "Retail Only", buy: null, sell: null, netProfit: null });
    expect(a.summary).toMatch(/Only one store's current price .*solo\.test/);
    expect(a.feeSource).toEqual(EBAY_FEE_SOURCE);
  });

  it("never pairs prices in different currencies", () => {
    const a = insight("gadgets", [offer("us.test", 499), offer("uk.test", 199, { currency: "GBP" })])!.arbitrage;
    expect(a.rating).toBe("RETAIL_ONLY");
    expect(a.buy).toBeNull();
    expect(a.summary).toMatch(/different currencies/);
  });

  it("rates a big same-currency gap High Arbitrage, after fees", () => {
    const a = insight("gadgets", [offer("cheap.test", 40), offer("dear.test", 80)])!.arbitrage;
    // fees = 80 × 13.6% + 0.40 = 11.28; net = 80 − 40 − 11.28 = 28.72 (71.8%, €22.98)
    expect(a).toMatchObject({ rating: "HIGH_ARBITRAGE", label: "High Arbitrage", resalePrice: 80, fees: 11.28, netProfit: 28.72, returnPct: 71.8, currency: "USD" });
    expect(a.buy?.merchant).toBe("cheap.test");
    expect(a.sell?.merchant).toBe("dear.test");
    expect(a.summary).toBe("Buying at cheap.test for $40.00 and reselling at $80.00 leaves about $28.72 per unit (71.8% return) after eBay fees, before shipping.");
  });

  it("rates a modest gap Moderate", () => {
    const a = insight("gadgets", [offer("cheap.test", 40), offer("dear.test", 52)])!.arbitrage;
    // fees = 7.47; net = 4.53 (11.3%, €3.62)
    expect(a).toMatchObject({ rating: "MODERATE", netProfit: 4.53, returnPct: 11.3 });
  });

  it("needs real money, not just a good percentage: a £1.88 gap is too thin", () => {
    const gbp = { currency: "GBP" };
    const a = insight("beauty", [offer("discount.test", 15, gbp), offer("brand.test", 20, gbp)])!.arbitrage;
    // fees = 3.12; net = 1.88 (12.5% return, but only €2.35)
    expect(a).toMatchObject({ rating: "RETAIL_ONLY", netProfit: 1.88, returnPct: 12.5 });
    expect(a.summary).toMatch(/leaves £1\.88 per unit after eBay fees: too thin/);
  });

  it("says when reselling would lose money", () => {
    const gbp = { currency: "GBP" };
    const a = insight("beauty", [offer("a.test", 31, gbp), offer("b.test", 35, gbp)])!.arbitrage;
    expect(a).toMatchObject({ rating: "RETAIL_ONLY", netProfit: -1.16 });
    expect(a.summary).toMatch(/would lose £1\.16 per unit/);
  });

  it("resells at the median of the other stores, not the most expensive one", () => {
    const a = insight("gadgets", [offer("w.test", 10), offer("x.test", 20), offer("y.test", 22), offer("z.test", 30)])!.arbitrage;
    expect(a.resalePrice).toBe(22);
    expect(a.sell?.merchant).toBe("y.test");
  });

  it("reports the currency with the best trade", () => {
    const gbp = { currency: "GBP" };
    const a = insight("gadgets", [
      offer("us-a.test", 40),
      offer("us-b.test", 45),
      offer("uk-a.test", 40, gbp),
      offer("uk-b.test", 90, gbp),
    ])!.arbitrage;
    expect(a.currency).toBe("GBP");
    expect(a.rating).toBe("HIGH_ARBITRAGE");
  });
});

describe("margin engine: which offers count", () => {
  it("keeps only the latest current offer per store", () => {
    const offers = [
      offer("shop.test", 30, { observedAt: daysAgo(10) }),
      offer("Shop.test", 25, { observedAt: daysAgo(1) }),
      offer("gone.test", 5, { availability: "OUT_OF_STOCK" }),
      offer("old.test", 5, { observedAt: daysAgo(40) }),
      offer("future.test", 5, { observedAt: daysAgo(-1) }),
    ];
    const current = currentOffersByStore(offers, asOf);
    expect(current.map((o) => [o.merchant, o.price])).toEqual([["Shop.test", 25]]);
  });

  it("drops a store whose newest capture is sold out, and prices from the stores left (v1.2.0)", () => {
    const offers = [
      offer("shop.test", 20, { observedAt: daysAgo(5) }),
      offer("shop.test", 20, { observedAt: daysAgo(1), availability: "OUT_OF_STOCK" }),
      offer("dear.test", 30, { observedAt: daysAgo(2) }),
    ];
    expect(currentOffersByStore(offers, asOf).map((o) => o.merchant)).toEqual(["dear.test"]);
    expect(insight("gadgets", offers)!.retailPrice.merchant).toBe("dear.test");
  });

  it("counts repeated captures of one store once, so they can't fake a gap", () => {
    const a = insight("gadgets", [offer("shop.test", 40, { observedAt: daysAgo(5) }), offer("shop.test", 80, { observedAt: daysAgo(1) })])!.arbitrage;
    expect(a.rating).toBe("RETAIL_ONLY");
    expect(a.buy).toBeNull();
  });

  it("charges eBay's smaller per-order fee on orders of 10 or less", () => {
    expect(resaleFee(10, MARKETPLACE_FEE)).toBe(1.66); // 1.36 + 0.30
    expect(resaleFee(10.01, MARKETPLACE_FEE)).toBe(1.76); // 1.36 + 0.40
  });

  it("charges own-shop card fees at the UK rate in pounds and the US rate otherwise", () => {
    expect(resaleFee(20, ownStoreFee("GBP"))).toBe(0.65); // 2% + 0.25
    expect(resaleFee(20, ownStoreFee("USD"))).toBe(0.88); // 2.9% + 0.30
    expect(resaleFee(5, ownStoreFee("EUR"))).toBe(0.45); // no smaller fee on small orders
  });

  it("is deterministic", () => {
    const offers = [offer("a.test", 40), offer("b.test", 52), offer("c.test", 60)];
    expect(insight("gadgets", offers)).toEqual(insight("gadgets", structuredClone(offers)));
  });
});

describe("margin engine: arbitrage rating (own shop)", () => {
  it("rates the same price gap again at card fees, citing Shopify's rate", () => {
    const gbp = { currency: "GBP" };
    const m = insight("beauty", [offer("discount.test", 15, gbp), offer("brand.test", 20, gbp)])!;
    // eBay: fees 3.12, net 1.88 ⇒ Retail Only. Own shop: fees 0.65, net 4.35 (29%, €5.44) ⇒ Moderate.
    expect(m.arbitrage).toMatchObject({ channel: "MARKETPLACE", channelLabel: "Resell on eBay", rating: "RETAIL_ONLY" });
    expect(m.arbitrageOwnStore).toMatchObject({
      channel: "OWN_STORE",
      channelLabel: "Resell in your own shop",
      rating: "MODERATE",
      fees: 0.65,
      netProfit: 4.35,
      returnPct: 29,
      currency: "GBP",
      feeSource: SHOPIFY_UK_FEE_SOURCE,
    });
    expect(m.arbitrageOwnStore.summary).toBe(
      "Buying at discount.test for £15.00 and reselling at £20.00 leaves about £4.35 per unit (29% return) after card fees, before shipping and advertising.",
    );
  });

  it("uses the US card rate outside pounds and the same thresholds", () => {
    const a = insight("gadgets", [offer("cheap.test", 40), offer("dear.test", 52)])!.arbitrageOwnStore;
    // fees = 52 × 2.9% + 0.30 = 1.81; net = 10.19 (25.5%, but only €8.15) ⇒ Moderate, not High
    expect(a).toMatchObject({ rating: "MODERATE", fees: 1.81, netProfit: 10.19, returnPct: 25.5, feeSource: SHOPIFY_US_FEE_SOURCE });
  });

  it("still needs a 10% return: a 9.8% gap is Retail Only", () => {
    const gbp = { currency: "GBP" };
    const a = insight("beauty", [offer("a.test", 31, gbp), offer("b.test", 35, gbp)])!.arbitrageOwnStore;
    expect(a).toMatchObject({ rating: "RETAIL_ONLY", netProfit: 3.05, returnPct: 9.8 });
    expect(a.summary).toMatch(/leaves £3\.05 per unit after card fees: too thin/);
  });

  it("explains a single store the same way, and names the fee it would use", () => {
    const m = insight("beauty", [offer("solo.test", 20, { currency: "GBP" })])!;
    expect(m.arbitrageOwnStore).toMatchObject({ rating: "RETAIL_ONLY", buy: null, feeSource: SHOPIFY_UK_FEE_SOURCE });
    expect(m.arbitrageOwnStore.summary).toBe(m.arbitrage.summary);
    expect(m.arbitrage.feeSource).toEqual(EBAY_FEE_SOURCE);
  });
});
