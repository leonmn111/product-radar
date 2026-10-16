import { describe, expect, it } from "vitest";
import type { FxRates } from "@/server/scoring/fx";
import type { RetailSource, SupplierSource } from "@/server/sources/types";
import { SourceError } from "@/server/sources/types";
import { BudgetExceededError, QueryBudget } from "./budget";
import { CONFIDENCE_GATE, confidenceOf } from "./confidence";
import { liveMargin } from "./margin";
import { searchTermFor, titleSimilarity } from "./match";
import { groupSameProduct, runLiveSearch } from "./search";
import type { Market, RetailListing, SupplierOffer } from "./types";

const asOf = new Date("2026-10-15T12:00:00.000Z");
const fx: FxRates = { date: "2026-10-12", perEur: { USD: 1.1181, GBP: 0.84478 } };

let n = 0;
const listing = (title: string, amount: number, market: Market = "GB", over: Partial<RetailListing> = {}): RetailListing => {
  const id = `R${++n}`;
  return {
    market,
    id,
    title,
    url: `https://www.amazon.co.uk/dp/${id}`,
    image: null,
    price: { amount, currency: market === "GB" ? "GBP" : "USD" },
    rating: 4.5,
    ratingsTotal: 100,
    sponsored: false,
    recentSales: null,
    evidence: { id: `test:${id}`, provider: "test", sourceUrl: `https://www.amazon.co.uk/dp/${id}`, observedAt: asOf.toISOString(), quality: 80, claim: title },
    ...over,
  };
};
const offer = (title: string, unit: number, shipping: number | null, market: Market = "GB"): SupplierOffer => {
  const id = `S${++n}`;
  return {
    id,
    title,
    url: `https://www.aliexpress.com/item/${id}.html`,
    image: null,
    unitPrice: { amount: unit, currency: "USD" },
    shipping: shipping === null ? null : { amount: shipping, currency: "USD" },
    shipsTo: market,
    evidence: { id: `test:${id}`, provider: "test", sourceUrl: `https://www.aliexpress.com/item/${id}.html`, observedAt: asOf.toISOString(), quality: 80, claim: title },
  };
};

describe("title matching", () => {
  it("matches the same product worded differently, and rejects conflicting specs", () => {
    expect(titleSimilarity("Magnetic Power Bank 10000mAh 20W", "Wireless Magnetic Power Bank 10000 mAh Portable 20W PD")).toBe(1);
    expect(titleSimilarity("Magnetic Power Bank 10000mAh", "Magnetic Power Bank 5000mAh")).toBe(0);
    expect(titleSimilarity("Magnetic Power Bank", "Aluminium Laptop Stand")).toBe(0);
  });

  it("builds a supplier search term from the title's words", () => {
    expect(searchTermFor("The NEW Magnetic Power Bank, 10000 mAh (Pack of 1)")).toBe("magnetic power bank 10000mah");
  });
});

describe("confidence gate", () => {
  const fresh = (k: number) => Array.from({ length: k }, () => ({ evidence: listing("x", 1).evidence }));

  it("needs about four fresh, independent, structured sources to reach 0.7", () => {
    expect(confidenceOf(fresh(3), asOf)).toBeLessThan(CONFIDENCE_GATE);
    expect(confidenceOf(fresh(4), asOf)).toBeGreaterThanOrEqual(CONFIDENCE_GATE);
  });

  it("counts a source once, and weighs a supplier by how well it matches", () => {
    const one = listing("x", 1).evidence;
    expect(confidenceOf([{ evidence: one }, { evidence: one }], asOf)).toBe(confidenceOf([{ evidence: one }], asOf));
    expect(confidenceOf([{ evidence: one, match: 0.5 }], asOf)).toBeLessThan(confidenceOf([{ evidence: one }], asOf));
  });
});

describe("query budget", () => {
  it("stops at the call limit and at the deadline", () => {
    let t = 0;
    const b = new QueryBudget({ maxCalls: 1, deadlineMs: 100 }, () => t);
    b.spendCall();
    expect(() => b.spendCall()).toThrow(BudgetExceededError);
    const late = new QueryBudget({ maxCalls: 5, deadlineMs: 100 }, () => t);
    t = 100;
    expect(() => late.spendCall()).toThrow("ran out of time");
  });
});

describe("live margin", () => {
  it("converts supplier costs at the ECB rate and names what isn't included", () => {
    const m = liveMargin("GB", "GBP", [{ amount: 21.99, currency: "GBP" }, { amount: 19.99, currency: "GBP" }], [offer("x", 5, 2)], fx)!;
    // $5 → £3.78 and $2 → £1.51 at 0.84478/1.1181; selling price = median £20.99.
    expect(m).toMatchObject({ currency: "GBP", sellingPrice: 20.99, supplierUnitCost: 3.78, shippingCost: 1.51, landedCost: 5.29, spread: 15.7, spreadPct: 74.8 });
    expect(m.notIncluded).toEqual(["marketplace fees", "VAT", "import duty", "advertising"]);
    expect(m.exchangeRate?.date).toBe("2026-10-12");
  });

  it("leaves unquoted shipping out and says so", () => {
    const m = liveMargin("GB", "GBP", [{ amount: 20, currency: "GBP" }], [offer("x", 5, null)], fx)!;
    expect(m.shippingCost).toBeNull();
    expect(m.notIncluded[0]).toBe("shipping to the UK (the supplier didn't quote it)");
    expect(m.label).toBe("Spread before shipping, fees, VAT, duty and advertising");
  });
});

describe("runLiveSearch", () => {
  const product = "Magnetic Power Bank 10000mAh 20W Wireless";
  const retail = (byMarket: Partial<Record<Market, RetailListing[]>>): RetailSource => ({
    name: "test-retail",
    product: async () => null,
    async search(_term, market, budget) {
      budget.spendCall();
      return byMarket[market] ?? [];
    },
  });
  const supplier = (offers: SupplierOffer[]): SupplierSource => ({
    name: "test-supplier",
    async search(_term, shipTo, budget) {
      budget.spendCall();
      return offers.map((o) => ({ ...o, shipsTo: shipTo }));
    },
  });

  it("shows a product only when retail and supplier evidence both clear the gate, with citations", async () => {
    const strong = [21.99, 19.99, 22.49, 20.99].map((p, i) => listing(`${product} ${["Portable", "Charger", "PD", "Slim"][i]}`, p));
    const suppliers = [5, 5.5, 4.8, 5.2].map((u) => offer(`${product} Power Bank`, u, 2));
    const r = await runLiveSearch("power bank", ["GB"], { retail: retail({ GB: strong }), supplier: supplier(suppliers), fx, now: () => asOf });
    expect(r.results).toHaveLength(1);
    const [top] = r.results;
    expect(top.confidence.overall).toBeGreaterThanOrEqual(CONFIDENCE_GATE);
    expect(top.citations).toHaveLength(8); // every listing and every supplier offer is cited
    expect(top.margin.currency).toBe("GBP");
    expect(r.withheld).toEqual([]);
    expect(r.usage.providerCalls).toBe(2);
  });

  it("withholds a thin result and says what evidence is missing", async () => {
    const r = await runLiveSearch("power bank", ["GB"], {
      retail: retail({ GB: [listing(product, 21.99)] }),
      supplier: supplier([offer(`${product} Power Bank`, 5, 2)]),
      fx,
      now: () => asOf,
    });
    expect(r.results).toEqual([]);
    expect(r.withheld[0].confidence).toBeLessThan(CONFIDENCE_GATE);
    expect(r.withheld[0].missing).toEqual([
      "more independent Amazon UK listings of this product (1 found agree on it)",
      "more or closer supplier matches (1 found)",
    ]);
  });

  it("reports a failing provider instead of guessing, and still answers for the other market", async () => {
    const failing: RetailSource = {
      name: "flaky",
      product: async () => null,
      async search(_t, market, budget) {
        budget.spendCall();
        if (market === "US") throw new SourceError("rainforest", "timed out");
        return [listing(product, 21.99)];
      },
    };
    const r = await runLiveSearch("power bank", ["US", "GB"], { retail: failing, supplier: supplier([]), fx, now: () => asOf });
    expect(r.sourceErrors).toEqual(["rainforest: timed out"]);
    expect(r.withheld.map((w) => w.market)).toEqual(["GB"]);
    expect(r.withheld[0].missing).toContain("a supplier offer that matches this product");
  });

  it("groups listings of the same product, most corroborated first", () => {
    const groups = groupSameProduct([listing("Aluminium Laptop Stand", 30), listing(product, 21), listing(`${product} Portable`, 22)]);
    expect(groups.map((g) => g.length)).toEqual([2, 1]);
  });
});
