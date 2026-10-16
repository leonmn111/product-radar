// Phase 0 test plan. The scaffolds throw until each module is built; the `todo`s are the behaviour
// each one must have, written first (test-driven, ROADMAP.md).

import { describe, expect, it } from "vitest";
import { runDailySnapshot } from "@/jobs/dailySnapshot";
import { checkResellability } from "./compliance";
import { calculateConfidence, METRIC_GATE, VERDICT_GATE } from "./confidence";
import { NotImplementedError } from "./errors";
import { calculateEUMargin, calculateUKMargin } from "./margin";

describe("confidence gates", () => {
  it("shows a Verdict from 0.5 and every number from 0.7 (CLAUDE.md Rule 5)", () => {
    expect(VERDICT_GATE).toBe(0.5);
    expect(METRIC_GATE).toBe(0.7);
  });
});

describe("scaffolds refuse to run until built", () => {
  it.each([
    ["calculateUKMargin", () => calculateUKMargin({} as never)],
    ["calculateEUMargin", () => calculateEUMargin({} as never)],
    ["calculateConfidence", () => calculateConfidence([])],
    ["checkResellability", () => checkResellability({} as never)],
  ])("%s throws NotImplementedError", (_name, call) => {
    expect(call).toThrow(NotImplementedError);
  });

  it("runDailySnapshot rejects with NotImplementedError", async () => {
    const inert = { now: () => new Date(), targets: async () => [], observe: async () => [], record: async () => {} };
    await expect(runDailySnapshot(inert)).rejects.toThrow(NotImplementedError);
  });
});

describe("calculateUKMargin (to build)", () => {
  it.todo("takes UK VAT out of the selling price at the point of sale, at the cited rate");
  it.todo("applies the TikTok Shop UK stack: 9% referral + £0.50 per order + the applied creator commission (10–20%)");
  it.todo("applies the Amazon FBA stack: referral fee (with its per-item minimum) + fulfilment per unit");
  it.todo("adds UK import duty only when a cited rate exists; otherwise lists it in `excluded`");
  it.todo("deducts the returns allowance (return rate × cost per return) and CAC per sale");
  it.todo("labels caller-supplied lines (VAT status, own CAC) as caller_supplied");
  it.todo("never puts an unsourced component into a total: it goes in `excluded` with the reason");
  it.todo("collects every evidence id it used into `evidenceIds`");
});

describe("calculateEUMargin (to build)", () => {
  it.todo("adds €3 customs duty and €2 handling per item to the landed cost, each cited");
  it.todo("uses the destination country's import VAT rate");
  it.todo("converts non-EUR costs only at a cited exchange rate, and says which");
});

describe("calculateConfidence (to build)", () => {
  it.todo("is 0 with no evidence");
  it.todo("weighs each item by quality × freshness (90-day half-life) × source type");
  it.todo("counts repeat captures of one source once");
  it.todo("needs about four fresh, independent, structured sources to reach 0.7, and about two for 0.5");
  it.todo("ignores evidence observed after the calculation time");
});

describe("checkResellability (to build)", () => {
  it.todo("flags brandDirect when the listing is sold by the brand itself");
  it.todo("flags trademarked from a cited trademark record in the target market");
  it.todo("flags requiresUKCA, cosmetics and batteries from the category and listing evidence");
  it.todo("leaves a flag null, with the reason, when the evidence doesn't settle it");
});

describe("runDailySnapshot (to build)", () => {
  it.todo("records one dated evidence set per target and never updates existing evidence");
  it.todo("keeps going when one target fails, and reports the failure");
});
