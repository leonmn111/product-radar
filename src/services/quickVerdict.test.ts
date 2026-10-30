import { describe, expect, it } from "vitest";
import { checkResellability } from "@/engine/compliance";
import type { Dossier, Evidence } from "@/types/dossier";
import { matchedSupplier, parseSupplierPrice, quickBreakdown, quickVerdict, subjectFlags, TEST_UNITS, type QuickSupplier } from "./quickVerdict";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const listing = (n: number, price: number): Evidence => ({
  id: `rainforest:amazon.co.uk:B0MUG000${n}`,
  provider: "rainforest",
  sourceType: "marketplace",
  sourceUrl: `https://www.amazon.co.uk/dp/B0MUG000${n}`,
  observedAt: NOW.toISOString(),
  publishedAt: null,
  quality: 90,
  claim: `Listed at £${price.toFixed(2)}`,
  value: price,
});
const unbranded = checkResellability({ title: "Silicone Kitchen Utensil Set 12 Piece", market: "UK" });
const dossier = (prices: number[], over: Partial<Dossier> = {}): Dossier =>
  ({
    product: { title: "Silicone Kitchen Utensil Set 12 Piece", query: "B0MUG00001", market: "UK", country: "GB", currency: "GBP", identifiers: { asin: "B0MUG00001" } },
    evidence: prices.map((p, i) => listing(i + 1, p)),
    resellability: unbranded,
    supplierMatches: [],
    ...over,
  }) as unknown as Dossier;
const yours = (amount: number): QuickSupplier => ({ amount, source: "you", evidence: null });
const FOUR = [19.99, 21.99, 22.49, 24.99]; // median £22.24

describe("quickVerdict", () => {
  it("says what you keep per sale before ads, after VAT, TikTok Shop UK fees and the creator cut: Test small", () => {
    const q = quickVerdict(dossier(FOUR), unbranded, yours(3.5), NOW);
    expect([q.tier, q.label, q.gate]).toEqual(["TEST", "Test small", null]);
    expect(q.sellingPrice).toBe(22.24);
    // £22.24 − VAT £3.71 − 9% £1.67 − £0.50 − 15% £2.78 − £3.50 = £10.08.
    expect(q.margin?.breakEvenAdCost.amount).toBe(10.08);
    expect(q.margin?.lines.find((l) => l.kind === "supplier")?.basis).toBe("caller_supplied");
  });

  it("G1: a loss before ads is Avoid, Loses £X per sale before ads", () => {
    const q = quickVerdict(dossier([10, 10, 10, 10]), unbranded, yours(9), NOW);
    expect([q.tier, q.label, q.gate, q.reason]).toEqual(["AVOID", "Avoid", "G1_PROFIT", "Loses £3.17 per sale before ads."]);
  });

  it("G3: a branded product is Avoid (brand-restricted), with nothing priced, whatever the supplier price", () => {
    const branded = checkResellability({ title: "Anker Soundcore P20i Wireless Earbuds", brand: "Anker", market: "UK" });
    const q = quickVerdict(dossier(FOUR), branded, yours(3.5), NOW);
    expect([q.tier, q.label, q.gate, q.margin]).toEqual(["AVOID", "Avoid (brand-restricted)", "G3_BRAND", null]);
  });

  it("withholds the money figure below the 0.7 gate on the UK price, and when there's no supplier price", () => {
    const thin = quickVerdict(dossier([22.24]), unbranded, yours(3.5), NOW);
    expect([thin.tier, thin.label, thin.margin]).toEqual(["WITHHELD", "Not enough evidence", null]);
    expect(thin.missing[0]).toMatch(/more current Amazon UK listings .*\(1 found; about 4 are needed\)/);
    const noPrice = quickVerdict(dossier(FOUR), unbranded, null, NOW);
    expect([noPrice.tier, noPrice.reason]).toEqual(["WITHHELD", "Add your supplier price to see what you'd keep."]);
  });

  it("falls back on the median of the exact AliExpress matches when no price is given", () => {
    const d = dossier(FOUR, { supplierMatches: [2.1, 2.9, 3.5].map((amount) => ({ unitPrice: { amount, currency: "GBP" }, evidenceIds: [`ae${amount}`] })) as never });
    expect(matchedSupplier(d)).toEqual({ amount: 2.9, source: "aliexpress_matches", evidence: null });
    expect(matchedSupplier(dossier(FOUR))).toBeNull();
  });

  it("checks what you'd sell: a pasted AliExpress or TikTok product's own name, not the Amazon listing's brand", () => {
    const amazonBranded = dossier(FOUR, { resellability: checkResellability({ title: "Lamicall Phone Stand", brand: "Lamicall", market: "UK" }) });
    expect(subjectFlags(amazonBranded, null).trademarkRisk.value).toBe(true);
    expect(subjectFlags(amazonBranded, { name: "Desktop Phone Stand Adjustable Height", brand: null }).trademarkRisk.value).toBe(false);
  });

  it("reads a supplier price in pounds, and refuses anything else", () => {
    expect([parseSupplierPrice("£4.50"), parseSupplierPrice(" 12 "), parseSupplierPrice(3.333), parseSupplierPrice(""), parseSupplierPrice(undefined)]).toEqual([4.5, 12, 3.33, null, null]);
    for (const bad of ["abc", "-2", "0", 20_000]) expect(parseSupplierPrice(bad)).toBeNaN();
  });
});

describe("quickBreakdown", () => {
  it("lists every cost line, what isn't counted, the break-even ad cost, the worst case and a capped ad test", () => {
    const d = dossier(FOUR);
    const q = quickVerdict(d, unbranded, yours(3.5), NOW);
    const b = quickBreakdown(d, q, yours(3.5), 2)!;
    expect(b.lines.map((l) => [l.label.split(" (")[0], l.amount])).toEqual([
      ["Supplier cost", 3.5],
      ["VAT", 3.71],
      ["TikTok Shop UK referral commission", 1.67],
      ["TikTok Shop UK self-ship order fee", 0.5],
      ["Creator commission", 2.78],
    ]);
    expect([b.keepPerSale, b.breakEvenAdCost, b.breakEvenSupplierPrice]).toEqual([10.08, 10.08, 13.58]);
    expect(b.notCounted).toEqual(["Shipping per unit", "Returns allowance"]);
    // A 10-unit test: £35 of stock, ads capped at 10 × £10.08.
    expect(b.worstCase).toEqual({ testUnits: TEST_UNITS, stock: 35, adBudget: 100.8, total: 135.8 });
    expect(b.adTestPlan).toHaveLength(3);
    expect(b.adTestPlan[1]).toContain("£10.08 per sale");
    expect(b.sellingPrice).toMatchObject({ amount: 22.24, listings: 4 });
    expect(b.rules.map((r) => r.url)).toContain("https://www.gov.uk/vat-rates");
    expect(b.freeLeft).toBe(2);
  });

  it("for a loss: no ads at all, the worst case is the stock, and the supplier price it would need", () => {
    const d = dossier([10, 10, 10, 10]);
    const q = quickVerdict(d, unbranded, yours(9), NOW);
    const b = quickBreakdown(d, q, yours(9), 0)!;
    expect([b.breakEvenAdCost, b.breakEvenSupplierPrice]).toEqual([0, 5.83]);
    expect(b.worstCase).toEqual({ testUnits: 10, stock: 90, adBudget: 0, total: 90 });
    expect(b.adTestPlan[0]).toBe("Don't advertise it at this supplier price: it loses £3.17 per sale before any ad spend.");
  });

  it("has nothing to break down without a margin", () => {
    const d = dossier([22.24]);
    expect(quickBreakdown(d, quickVerdict(d, unbranded, yours(3.5), NOW), yours(3.5), 3)).toBeNull();
  });
});
