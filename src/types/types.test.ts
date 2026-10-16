// Type-level checks on the data model: tsc fails (npm run typecheck) if the 8-part shape drifts.

import { describe, expectTypeOf, it } from "vitest";
import type { Dossier, Gated, ResellabilityFlags, SupplierMatches, Verdict } from "./dossier";
import type { FeeStack, LandedMargin, Money } from "./financials";

describe("Dossier types", () => {
  it("has exactly the 8 parts, plus its id, time and product", () => {
    expectTypeOf<keyof Dossier>().toEqualTypeOf<
      | "id"
      | "generatedAt"
      | "product"
      | "sample"
      | "notes"
      | "verdict"
      | "resellability"
      | "landedMargin"
      | "momentum"
      | "saturation"
      | "supplierMatches"
      | "evidence"
      | "exports"
    >();
  });

  it("gates the verdict, margin, momentum and saturation", () => {
    expectTypeOf<Dossier["verdict"]>().toEqualTypeOf<Gated<Verdict>>();
    expectTypeOf<Dossier["landedMargin"]>().toEqualTypeOf<Gated<{ uk: LandedMargin; eu: LandedMargin | null }>>();
  });

  it("can't hold a shown value without its confidence", () => {
    expectTypeOf<Extract<Gated<number>, { status: "shown" }>>().toHaveProperty("confidence").toEqualTypeOf<number>();
    expectTypeOf<Extract<Gated<number>, { status: "withheld" }>>().not.toHaveProperty("value");
    expectTypeOf<Extract<Gated<number>, { status: "withheld" }>["reason"]>().toEqualTypeOf<"Insufficient Data" | "Not Sellable">();
  });

  it("has the five resellability flags, and at most three supplier matches", () => {
    expectTypeOf<keyof ResellabilityFlags>().toEqualTypeOf<"brandDirect" | "trademarkRisk" | "requiresUKCA" | "cosmetics" | "batteries">();
    expectTypeOf<SupplierMatches["length"]>().toEqualTypeOf<0 | 1 | 2 | 3>();
  });

  it("returns net profit, ROI and break-even ad cost on every margin", () => {
    expectTypeOf<LandedMargin["netProfit"]>().toEqualTypeOf<Money>();
    expectTypeOf<LandedMargin["roiPercentage"]>().toEqualTypeOf<number>();
    expectTypeOf<LandedMargin["breakEvenAdCost"]>().toEqualTypeOf<Money>();
  });

  it("covers TikTok Shop UK, Amazon FBA and custom fee stacks", () => {
    expectTypeOf<FeeStack["channel"]>().toEqualTypeOf<"tiktok_shop_uk" | "amazon_uk_fba" | "amazon_eu_fba" | "custom">();
  });
});
