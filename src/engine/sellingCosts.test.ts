import { describe, expect, it } from "vitest";
import { calculateUKMargin } from "./margin";
import { ukSellingCosts } from "./sellingCosts";

describe("ukSellingCosts: VAT and platform fees from the price alone", () => {
  it("matches the landed margin's VAT and fee lines exactly, so the calculator and the waterfall agree", () => {
    for (const price of [9.99, 22.24, 49.5, 160, 599]) {
      const m = calculateUKMargin({
        retailPrice: { amount: price, basis: "sourced", evidenceIds: ["r"] },
        supplierCost: { amount: 1, basis: "caller_supplied", evidenceIds: [] },
        shipping: null,
        returns: null,
        adCostPerSale: null,
      });
      const c = ukSellingCosts(price);
      expect(c.lines).toEqual(m.lines.filter((l) => l.kind === "vat" || l.kind === "platform_fee"));
      expect(c.collectedAt).toBe(m.vat.collectedAt);
    }
  });

  it("adds up VAT at 20% inside the price and the TikTok Shop UK fees", () => {
    const c = ukSellingCosts(22.24);
    // VAT 22.24 − 22.24 / 1.2 = 3.71; 9% and 15% of £18.53 = 1.67 and 2.78; £0.50 per order.
    expect(c.lines.map((l) => l.amount.amount)).toEqual([3.71, 1.67, 0.5, 2.78]);
    expect(c.total).toBe(8.66);
    expect(c.excluded).toEqual([]);
  });

  it("names customs duty as not counted above £135 before VAT", () => {
    const c = ukSellingCosts(599);
    expect(c.collectedAt).toBe("import");
    expect(c.excluded.map((x) => x.kind)).toEqual(["duty"]);
  });
});
