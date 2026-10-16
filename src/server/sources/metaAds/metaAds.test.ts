import { describe, expect, it } from "vitest";
import { fetchLongestRunningAd, SIMULATED_AD_DAYS, simulatedAdSource } from "./index";

describe("fetchLongestRunningAd (simulated)", () => {
  it("returns a whole number of days from 0 to 120", () => {
    const seen = Array.from({ length: 2000 }, () => fetchLongestRunningAd("UGREEN"));
    expect(seen.every((d) => Number.isInteger(d) && d >= SIMULATED_AD_DAYS.min && d <= SIMULATED_AD_DAYS.max)).toBe(true);
    expect(Math.max(...seen)).toBe(120); // both ends are reachable
    expect(Math.min(...seen)).toBe(0);
  });

  it("needs a brand, and is labelled simulated so a real Dossier can refuse it", async () => {
    expect(() => fetchLongestRunningAd("  ")).toThrow(RangeError);
    expect(simulatedAdSource.method).toBe("simulated");
    expect(await simulatedAdSource.longestRunningAdDays("UGREEN")).toBeGreaterThanOrEqual(0);
  });
});
