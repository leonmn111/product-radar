import { describe, expect, it } from "vitest";
import type { AmazonFBAFeeStack, CostInput, EUMarginParams, UKMarginParams } from "@/types/financials";
import { calculateEUMargin, calculateUKMargin, MarginInputError } from "./margin";
import { EU_DUTY_EVIDENCE, EU_HANDLING_FEE_EVIDENCE, TIKTOK_UK_REFERRAL_EVIDENCE, UK_LOW_VALUE_EVIDENCE, UK_VAT_EVIDENCE } from "./policy";

const sourced = (amount: number, id: string): CostInput => ({ amount, basis: "sourced", evidenceIds: [id] });
const mine = (amount: number): CostInput => ({ amount, basis: "caller_supplied", evidenceIds: [] });
const amountOf = (m: ReturnType<typeof calculateUKMargin>, label: RegExp) => m.lines.find((l) => label.test(l.label))?.amount.amount;

// A £24.00 TikTok Shop UK sale: £20.00 before VAT, so VAT is £4.00 and the fees work on £20.00.
const ukSale: UKMarginParams = {
  retailPrice: sourced(24, "listing:tiktok:1"),
  supplierCost: sourced(4.2, "aliexpress:1"),
  shipping: sourced(2.1, "quote:1"),
  returns: { returnRate: 0.05, costPerReturn: 8, basis: "caller_supplied", evidenceIds: [] },
  adCostPerSale: mine(3),
};

describe("calculateUKMargin", () => {
  const m = calculateUKMargin(ukSale);

  it("applies the default TikTok Shop UK stack: 9% + £0.50 + 15% creator = £5.30 on a £24 sale", () => {
    expect(m.channel).toBe("tiktok_shop_uk");
    expect(amountOf(m, /referral/)).toBe(1.8); // 9% of £20.00
    expect(amountOf(m, /order fee/)).toBe(0.5);
    expect(amountOf(m, /Creator/)).toBe(3); // 15% of £20.00
    expect(m.lines.filter((l) => l.kind === "platform_fee").reduce((s, l) => s + l.amount.amount, 0)).toBeCloseTo(5.3, 10);
  });

  it("takes 20% UK VAT out of the price, collected at the point of sale for a consignment under £135", () => {
    expect(amountOf(m, /^VAT/)).toBe(4);
    expect(m.vat).toEqual({ rate: 0.2, collectedAt: "point_of_sale" });
  });

  it("nets the playbook formula: 24 − (4.20 + 2.10 + 4.00 + 5.30 + 0.40 + 3.00) = £5.00", () => {
    expect(m.totalCosts).toEqual({ amount: 19, currency: "GBP" });
    expect(m.netProfit).toEqual({ amount: 5, currency: "GBP" });
    expect(m.landedCost.amount).toBe(6.3);
    expect(m.roiPercentage).toBe(79.4); // 5.00 / 6.30
    expect(m.netMarginPct).toBe(20.8); // 5.00 / 24.00
    expect(m.breakEvenAdCost).toEqual({ amount: 8, currency: "GBP" }); // net profit before the £3 ad cost
    expect(m.complete).toBe(true);
  });

  it("labels the unconfirmed £0.50 fee and the 15% creator commission as estimates, and cites the rest", () => {
    expect(m.lines.filter((l) => l.basis === "estimate").map((l) => l.kind)).toEqual(["platform_fee", "platform_fee"]);
    expect(m.evidenceIds).toEqual(
      expect.arrayContaining(["listing:tiktok:1", "aliexpress:1", "quote:1", UK_VAT_EVIDENCE.id, UK_LOW_VALUE_EVIDENCE.id, TIKTOK_UK_REFERRAL_EVIDENCE.id]),
    );
  });

  it("moves VAT to import and names the unknown customs duty above £135", () => {
    const big = calculateUKMargin({ ...ukSale, retailPrice: sourced(180, "listing:tiktok:2") }); // £150 before VAT
    expect(big.vat.collectedAt).toBe("import");
    expect(big.excluded.map((e) => e.kind)).toEqual(["duty"]);
    expect(big.complete).toBe(false);
  });

  it("leaves an unquoted cost out of the totals and names it, never guessing", () => {
    const noShip = calculateUKMargin({ ...ukSale, shipping: null, adCostPerSale: null });
    expect(noShip.excluded.map((e) => e.kind)).toEqual(["shipping", "ad_cost"]);
    expect(noShip.netProfit.amount).toBe(10.1); // 5.00 + 2.10 shipping + 3.00 ad cost, both unknown
    expect(noShip.breakEvenAdCost.amount).toBe(10.1);
    expect(noShip.complete).toBe(false);
  });

  it("shares the per-order fee across identical units in one parcel", () => {
    expect(amountOf(calculateUKMargin({ ...ukSale, unitsPerParcel: 2 }), /order fee/)).toBe(0.25);
  });

  it("rejects bad input instead of computing with it", () => {
    expect(() => calculateUKMargin({ ...ukSale, supplierCost: { amount: -1, basis: "caller_supplied", evidenceIds: [] } })).toThrow(MarginInputError);
    expect(() => calculateUKMargin({ ...ukSale, shipping: { amount: 2, basis: "sourced", evidenceIds: [] } })).toThrow("a sourced figure needs at least one evidence id");
  });
});

// A €29.75 Amazon.de sale: €25.00 before 19% German VAT.
const amazonDE: AmazonFBAFeeStack = {
  channel: "amazon_eu_fba",
  marketplace: "amazon.de",
  referral: { kind: "percent", label: "Amazon referral fee (15% of the price)", rate: 0.15, base: "price_inc_vat", minimumPerItem: 0.3, basis: "sourced", evidenceIds: ["amazon:de:fees"] },
  fulfilmentPerUnit: { kind: "fixed", label: "FBA fulfilment", amount: 3.1, basis: "sourced", evidenceIds: ["amazon:de:fba"] },
  storagePerUnit: { kind: "fixed", label: "FBA storage", amount: 0.1, basis: "sourced", evidenceIds: ["amazon:de:storage"] },
};
const euSale: EUMarginParams = {
  country: "DE",
  feeStack: amazonDE,
  retailPrice: sourced(29.75, "listing:amazon.de:1"),
  supplierCost: sourced(4.5, "aliexpress:2"),
  shipping: sourced(2.4, "quote:2"),
  returns: { returnRate: 0.03, costPerReturn: 10, basis: "caller_supplied", evidenceIds: [] },
  adCostPerSale: mine(2),
};

describe("calculateEUMargin", () => {
  const m = calculateEUMargin(euSale);

  it("adds the 2026 €3 customs duty and the €2 handling fee per item on a parcel under €150", () => {
    expect(m.lines.find((l) => l.kind === "duty")).toMatchObject({ amount: { amount: 3, currency: "EUR" }, basis: "sourced", evidenceIds: [EU_DUTY_EVIDENCE.id] });
    // Proposed, not adopted: included by default but labelled an estimate.
    expect(m.lines.find((l) => l.kind === "handling")).toMatchObject({ amount: { amount: 2, currency: "EUR" }, basis: "estimate", evidenceIds: [EU_HANDLING_FEE_EVIDENCE.id] });
    expect(m.landedCost.amount).toBe(11.9); // 4.50 + 2.40 + 3.00 + 2.00
  });

  it("applies German IOSS VAT at 19%, collected at the point of sale", () => {
    expect(amountOf(m, /^VAT/)).toBe(4.75);
    expect(m.vat).toEqual({ rate: 0.19, collectedAt: "point_of_sale" });
  });

  it("nets the formula: 29.75 − (4.50 + 2.40 + 3 + 2 + 4.75 + 7.66 fees + 0.30 + 2.00) = €3.14", () => {
    expect(amountOf(m, /referral/)).toBe(4.46); // 15% of €29.75 = 4.4625
    expect(m.totalCosts.amount).toBe(26.61);
    expect(m.netProfit).toEqual({ amount: 3.14, currency: "EUR" });
    expect(m.roiPercentage).toBe(26.4); // 3.14 / 11.90
    expect(m.breakEvenAdCost.amount).toBe(5.14);
    expect(m.complete).toBe(true);
  });

  it("charges the €3 once per item type, so identical units in one parcel share it", () => {
    const two = calculateEUMargin({ ...euSale, unitsPerParcel: 2 });
    expect(two.lines.find((l) => l.kind === "duty")?.amount.amount).toBe(1.5);
    expect(two.lines.find((l) => l.kind === "handling")?.amount.amount).toBe(2);
  });

  it("drops the low-value rules above €150: VAT at import, and the commodity-code duty named", () => {
    const big = calculateEUMargin({ ...euSale, retailPrice: sourced(238, "listing:amazon.de:2") }); // €200 before VAT
    expect(big.lines.some((l) => l.kind === "duty" || l.kind === "handling")).toBe(false);
    expect(big.vat.collectedAt).toBe("import");
    expect(big.excluded.map((e) => e.kind)).toEqual(["duty"]);
  });

  it("can leave out the proposed handling fee, and says so", () => {
    const without = calculateEUMargin({ ...euSale, includeProposedHandlingFee: false });
    expect(without.excluded).toEqual([{ kind: "handling", label: "EU customs handling fee", reason: "proposed but not adopted; left out at the caller's request" }]);
    expect(without.netProfit.amount).toBe(5.14);
  });

  it("uses each country's own VAT rate, and refuses to guess one it doesn't have", () => {
    expect(calculateEUMargin({ ...euSale, country: "FR" }).vat.rate).toBe(0.2);
    expect(() => calculateEUMargin({ ...euSale, country: "HU" })).toThrow(MarginInputError);
    expect(calculateEUMargin({ ...euSale, country: "HU", vatRate: { rate: 0.27, basis: "sourced", evidenceIds: ["tedb:hu"] } }).vat.rate).toBe(0.27);
  });

  it("applies Amazon's per-item referral minimum", () => {
    const cheap = calculateEUMargin({ ...euSale, retailPrice: sourced(1.19, "listing:amazon.de:3"), supplierCost: sourced(0.2, "aliexpress:3") });
    expect(cheap.lines.find((l) => /referral/.test(l.label))?.amount.amount).toBe(0.3); // 15% would be 0.18
  });
});
