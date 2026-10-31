import { describe, expect, it } from "vitest";
import { euDutyMargin } from "./euDuty";

const RATE = 0.84478; // £ per €1, ECB 12 October 2026
const sale = { salePrice: 24.99, supplierCost: 5, shipping: 4.5, category: "home", country: "DE", gbpPerEur: RATE };

describe("euDutyMargin", () => {
  it("takes German VAT out of the price, then the €3 duty and the €2 handling fee in pounds", () => {
    const r = euDutyMargin(sale)!;
    // £24.99 incl. 19% VAT → £21.00 before VAT (€24.86, under €150) and £3.99 VAT.
    expect([r.priceBeforeVat, r.vat, r.valueEur, r.lowValue]).toEqual([21, 3.99, 24.86, true]);
    expect(r.duty).toMatchObject({ amount: 2.53, kind: "flat" }); // €3 × 0.84478
    expect(r.handling).toBe(1.69); // €2 × 0.84478
    // 24.99 − 3.99 − 5 − 4.50 − 2.53 − 1.69 = 7.28
    expect([r.profit, r.marginPct, r.newCharges, r.profitBefore]).toEqual([7.28, 29.1, 4.22, 11.5]);
  });

  it("uses each country's own VAT rate", () => {
    expect(euDutyMargin({ ...sale, country: "SE" })!.vat).toBe(5); // 25%: 24.99 − 24.99 / 1.25
    expect(euDutyMargin({ ...sale, country: "XX" })).toBeNull();
  });

  it("over €150: no flat €3, the sourced category rate where there is one, otherwise not counted, and the €2 fee still due", () => {
    const shoes = euDutyMargin({ ...sale, salePrice: 199, category: "footwear" })!;
    expect(shoes.lowValue).toBe(false);
    expect(shoes.duty).toMatchObject({ kind: "category_rate", amount: 28.26 }); // 16.9% of £167.2269 (£199 before 19% VAT)
    expect(shoes.handling).toBe(1.69);
    expect(shoes.newCharges).toBe(1.69); // only the handling fee is new over €150
    const lamp = euDutyMargin({ ...sale, salePrice: 199, category: "home" })!;
    expect(lamp.duty).toMatchObject({ kind: "not_counted", amount: 0 });
    expect(lamp.duty.note).toMatch(/not counted/);
  });

  it("waits for a sale price", () => {
    expect(euDutyMargin({ ...sale, salePrice: 0 })).toBeNull();
    expect(euDutyMargin({ ...sale, salePrice: Number.NaN })).toBeNull();
  });
});
