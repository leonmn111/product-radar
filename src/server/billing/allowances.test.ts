import { describe, expect, it } from "vitest";
import { billingCycleStart, PRO_FREE_SEARCHES } from "./allowances";

describe("billingCycleStart", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  it("runs from one month before the subscription's period end", () => {
    expect(billingCycleStart(new Date("2026-11-03T09:00:00Z"), now).toISOString()).toBe("2026-10-03T09:00:00.000Z");
  });
  it("falls back to the calendar month without a usable period end", () => {
    expect(billingCycleStart(null, now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(billingCycleStart(new Date("2026-09-01T00:00:00Z"), now).toISOString()).toBe("2026-10-01T00:00:00.000Z"); // already ended
    expect(billingCycleStart(new Date("2027-01-20T00:00:00Z"), now).toISOString()).toBe("2026-10-01T00:00:00.000Z"); // over a month away
  });
  it("gives Pro 100 free searches", () => {
    expect(PRO_FREE_SEARCHES).toBe(100);
  });
});
