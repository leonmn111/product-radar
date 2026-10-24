import { describe, expect, it } from "vitest";
import { marginInsight, type MarginOffer } from "@/server/margins/engine";
import type { FxRates } from "@/server/scoring/fx";
import type { ProductDto } from "./service";
import { hasPriceGap, pickShowcase } from "./showcase";

const asOf = new Date("2026-10-01T00:00:00Z");
const fx: FxRates = { date: "2026-10-01", perEur: { USD: 1.25, GBP: 0.8 } };

let n = 0;
const offer = (merchant: string, price: number, currency = "GBP"): MarginOffer => ({
  merchant,
  url: `https://${merchant}/p`,
  price,
  currency,
  availability: "IN_STOCK",
  observedAt: new Date(asOf.getTime() - 2 * 86_400_000),
  sourceEvidenceId: `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`,
  qualityScore: 80,
});

// Just the fields the showcase reads, with a real margin insight from the engine.
const product = (name: string, offers: MarginOffer[], over: { category?: string; sourceCount?: number; overall?: number; isSample?: boolean } = {}) =>
  ({
    id: `id-${name}`,
    name,
    category: over.category ?? "beauty",
    isSample: over.isSample ?? false,
    sourceCount: over.sourceCount ?? offers.length,
    scores: { OVERALL: { value: over.overall ?? 60, confidence: 0.5 } },
    margin: marginInsight({ offers, asOf, fx }),
  }) as unknown as ProductDto;

describe("hasPriceGap", () => {
  it("needs two stores selling in one currency at different prices", () => {
    expect(hasPriceGap(product("gap", [offer("a.test", 15), offer("b.test", 20)]))).toBe(true);
    expect(hasPriceGap(product("same price", [offer("a.test", 20), offer("b.test", 20)]))).toBe(false);
    expect(hasPriceGap(product("one store", [offer("a.test", 20)]))).toBe(false);
    expect(hasPriceGap(product("two currencies", [offer("a.test", 15, "GBP"), offer("b.test", 30, "USD")]))).toBe(false);
    expect(hasPriceGap(product("no price", []))).toBe(false);
  });
});

describe("pickShowcase", () => {
  it("leads with the strongest resale rating, then the most sources", () => {
    const moderate = product("moderate", [offer("a.test", 15), offer("b.test", 20)], { sourceCount: 2 }); // own shop nets £4.35, 29%
    const thin = product("thin", [offer("a.test", 9.6), offer("b.test", 12)], { sourceCount: 9, category: "gadgets" });
    const thinner = product("thinner", [offer("a.test", 9.8), offer("b.test", 12)], { sourceCount: 3, category: "gadgets" });
    expect(pickShowcase([thinner, thin, moderate]).map((p) => p.name)).toEqual(["moderate", "thin"]);
  });

  it("prefers a second product from another category", () => {
    const first = product("first", [offer("a.test", 15), offer("b.test", 20)], { sourceCount: 5 });
    const sameCategory = product("same category", [offer("a.test", 9.6), offer("b.test", 12)], { sourceCount: 4 });
    const otherCategory = product("other category", [offer("a.test", 369), offer("b.test", 399)], { sourceCount: 2, category: "gadgets" });
    expect(pickShowcase([sameCategory, otherCategory, first]).map((p) => p.name)).toEqual(["first", "other category"]);
    // With only one category to choose from, it still fills the second slot.
    expect(pickShowcase([sameCategory, first]).map((p) => p.name)).toEqual(["first", "same category"]);
  });

  it("never pads the showcase with samples or products without a real price gap", () => {
    const sample = product("sample", [offer("a.test", 15), offer("b.test", 20)], { isSample: true });
    const flat = product("flat", [offer("a.test", 20), offer("b.test", 20)]);
    const single = product("single", [offer("a.test", 20)]);
    expect(pickShowcase([sample, flat, single])).toEqual([]);
    const real = product("real", [offer("a.test", 15), offer("b.test", 20)]);
    expect(pickShowcase([sample, flat, real]).map((p) => p.name)).toEqual(["real"]);
  });

  it("returns at most n products", () => {
    const ps = ["a", "b", "c"].map((x) => product(x, [offer("a.test", 15), offer("b.test", 20)], { category: x }));
    expect(pickShowcase(ps)).toHaveLength(2);
    expect(pickShowcase(ps, 1)).toHaveLength(1);
  });
});
