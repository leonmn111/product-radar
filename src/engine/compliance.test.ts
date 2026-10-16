import { describe, expect, it } from "vitest";
import { checkResellability, ComplianceInputError, isSellable, type ProductData } from "./compliance";

const listing = (over: Partial<ProductData> = {}): ProductData => ({
  title: "Ceramic Coffee Mug 350ml, Matte Glaze",
  brand: null,
  sellerName: "HomeGoods Trading",
  category: "Kitchen",
  evidenceIds: ["listing:1"],
  ...over,
});

describe("checkResellability", () => {
  it("clears a plain unbranded product, citing the listing", () => {
    const f = checkResellability(listing());
    expect(Object.values(f).map((x) => x.value)).toEqual([false, false, false, false, false]);
    expect(f.trademarkRisk.evidenceIds).toEqual(["listing:1"]);
    expect(isSellable(f)).toBe(true);
  });

  it("flags brandDirect when the seller is the brand, ignoring store suffixes", () => {
    expect(checkResellability(listing({ brand: "UGREEN", sellerName: "UGREEN Official Store UK" })).brandDirect.value).toBe(true);
    expect(checkResellability(listing({ brand: "UGREEN", sellerName: "Gadget Deals Ltd" })).brandDirect.value).toBe(false);
    // A brand with no seller name can't be checked: unknown, not assumed safe.
    expect(checkResellability(listing({ brand: "UGREEN", sellerName: null })).brandDirect.value).toBeNull();
  });

  it("flags trademark risk for a brand, a ™/® symbol, a known mark, or a trademark record", () => {
    expect(checkResellability(listing({ brand: "Anker" })).trademarkRisk.value).toBe(true);
    expect(checkResellability(listing({ title: "SnugFit® Ceramic Mug" })).trademarkRisk.value).toBe(true);
    const magsafe = checkResellability(listing({ title: "Magnetic Power Bank for MagSafe 10000mAh" })).trademarkRisk;
    expect(magsafe).toMatchObject({ value: true, reason: expect.stringContaining("MagSafe (Apple)") });
    const record = checkResellability(listing({ trademarkRecords: [{ mark: "MUGGO", office: "UK IPO", evidenceId: "ukipo:123" }] })).trademarkRisk;
    expect(record.evidenceIds).toEqual(["listing:1", "ukipo:123"]);
    expect(checkResellability(listing({ brand: "Generic" })).trademarkRisk.value).toBe(false);
  });

  it("flags UKCA for electronics and toys, and says CE for the EU", () => {
    expect(checkResellability(listing({ title: "Wireless Bluetooth Speaker" })).requiresUKCA.value).toBe(true);
    expect(checkResellability(listing({ title: "Plush Teddy Bear for Kids" })).requiresUKCA.value).toBe(true);
    expect(checkResellability(listing({ title: "LED Desk Lamp", market: "EU" })).requiresUKCA.reason).toContain("CE marking (EU)");
  });

  it("flags cosmetics and batteries from the listing text", () => {
    expect(checkResellability(listing({ title: "Vitamin C Face Serum 30ml" })).cosmetics.value).toBe(true);
    expect(checkResellability(listing({ title: "Portable Charger 10000 mAh" })).batteries.value).toBe(true);
    expect(checkResellability(listing({ title: "Mug", bulletPoints: ["Includes a rechargeable lithium battery"] })).batteries.value).toBe(true);
  });

  it("isn't sellable when any flag is tripped", () => {
    const powerBank = checkResellability(listing({ title: "Magnetic Power Bank 10000mAh" }));
    expect([powerBank.requiresUKCA.value, powerBank.batteries.value]).toEqual([true, true]);
    expect(isSellable(powerBank)).toBe(false);
  });

  it("validates the product data", () => {
    expect(() => checkResellability({ title: "" })).toThrow(ComplianceInputError);
    expect(() => checkResellability(null)).toThrow(ComplianceInputError);
  });
});
