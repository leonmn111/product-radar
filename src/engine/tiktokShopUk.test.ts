import { describe, expect, it } from "vitest";
import { ukSellingCosts } from "./sellingCosts";
import { tiktokShopUkMargin } from "./tiktokShopUk";

const sale = { salePrice: 24.99, landedCost: 6, category: "standard", creatorPct: 15, vatRegistered: false };

describe("tiktokShopUkMargin", () => {
  it("takes 9% + £0.50 and the creator's cut off the sale price; the rest is the most ads can cost", () => {
    const r = tiktokShopUkMargin(sale)!;
    // 9% of £24.99 = £2.25 (+ £0.50 = £2.75); 15% = £3.75; 24.99 − 6 − 2.75 − 3.75 = 12.49
    expect([r.referral, r.orderFee, r.platformFee, r.creatorCut, r.vat]).toEqual([2.25, 0.5, 2.75, 3.75, 0]);
    expect([r.netProfit, r.marginPct, r.maxAdCost, r.breakEvenRoas]).toEqual([12.49, 50, 12.49, 2]);
  });

  it("charges 5% in Electronics / Beauty", () => {
    const r = tiktokShopUkMargin({ ...sale, category: "electronics_beauty" })!;
    expect([r.referralRate, r.referral, r.platformFee, r.netProfit]).toEqual([0.05, 1.25, 1.75, 13.49]);
  });

  it("VAT-registered: a sixth of the price is VAT and both commissions use the price before VAT, like the Dossier", () => {
    const r = tiktokShopUkMargin({ ...sale, vatRegistered: true })!;
    // £24.99 incl. 20% VAT → £20.825 before VAT, £4.16 VAT (£4.165 in floating point, just under); 9% = £1.87; 15% = £3.12
    expect([r.vat, r.referral, r.creatorCut]).toEqual([4.16, 1.87, 3.12]);
    expect(r.netProfit).toBe(9.34); // 24.99 − 4.16 − 6 − 1.87 − 0.50 − 3.12
    // Same VAT and fee lines as the margin engine's TikTok Shop UK stack.
    expect(ukSellingCosts(24.99).lines.map((l) => l.amount.amount)).toEqual([4.16, 1.87, 0.5, 3.12]);
  });

  it("a sale that loses money before ads leaves nothing to spend on ads", () => {
    const r = tiktokShopUkMargin({ ...sale, salePrice: 9.99, landedCost: 8 })!;
    // 9.99 − 8 − (0.90 + 0.50) − 1.50 = −0.91
    expect([r.netProfit, r.maxAdCost, r.breakEvenRoas]).toEqual([-0.91, 0, null]);
  });

  it("waits for a sale price and a creator commission between 0 and 100%", () => {
    expect(tiktokShopUkMargin({ ...sale, salePrice: 0 })).toBeNull();
    expect(tiktokShopUkMargin({ ...sale, salePrice: Number.NaN })).toBeNull();
    expect(tiktokShopUkMargin({ ...sale, creatorPct: 101 })).toBeNull();
    expect(tiktokShopUkMargin({ ...sale, creatorPct: 0 })!.creatorCut).toBe(0);
  });
});
