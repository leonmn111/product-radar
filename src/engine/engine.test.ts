// The daily snapshot job is still a template (ROADMAP Phase 0): it refuses to run until built.
// The engine modules have their own test files: margin, compliance and confidence.

import { describe, expect, it } from "vitest";
import { runDailySnapshot } from "@/jobs/dailySnapshot";
import { NotImplementedError } from "./errors";

describe("runDailySnapshot (to build)", () => {
  it("rejects with NotImplementedError until built", async () => {
    const inert = { now: () => new Date(), targets: async () => [], observe: async () => [], record: async () => {} };
    await expect(runDailySnapshot(inert)).rejects.toThrow(NotImplementedError);
  });

  it.todo("records one dated evidence set per target and never updates existing evidence");
  it.todo("keeps going when one target fails, and reports the failure");
});
