import { describe, expect, it, vi } from "vitest";
import { getBillingSummary } from "./summary";

const dbWith = (row: unknown) => ({ user: { findUnique: vi.fn(async () => row) } }) as never;

describe("getBillingSummary", () => {
  it("reports the subscription the webhook last stored", async () => {
    const end = new Date("2026-11-12");
    const s = await getBillingSummary(
      dbWith({ stripeCustomerId: "cus_1", subscriptionStatus: "ACTIVE", subscriptionCurrentPeriodEnd: end, subscriptionCancelAtPeriodEnd: true }),
      "u1",
    );
    expect(s).toEqual({ hasBillingAccount: true, status: "ACTIVE", currentPeriodEnd: end, cancelAtPeriodEnd: true });
  });

  it("has no billing account for someone who never checked out", async () => {
    const empty = { stripeCustomerId: null, subscriptionStatus: null, subscriptionCurrentPeriodEnd: null, subscriptionCancelAtPeriodEnd: false };
    expect(await getBillingSummary(dbWith(empty), "u1")).toEqual({ hasBillingAccount: false, status: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });
    expect((await getBillingSummary(dbWith(null), "gone")).hasBillingAccount).toBe(false);
  });
});
