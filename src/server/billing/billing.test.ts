import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { snapshotFromStripe, tierForStatus } from "./subscription";
import { InvalidSignatureError, verifyStripeEvent } from "./webhook";

const sub = (over: Record<string, unknown> = {}) =>
  ({
    id: "sub_123",
    object: "subscription",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1_800_000_000 }] },
    ...over,
  }) as unknown as Stripe.Subscription;

describe("tierForStatus", () => {
  it("grants Pro while the subscription is paid, trialing or being retried", () => {
    expect(tierForStatus("ACTIVE")).toBe("PRO");
    expect(tierForStatus("TRIALING")).toBe("PRO");
    expect(tierForStatus("PAST_DUE")).toBe("PRO");
  });
  it("drops to Free when it ends or never completed", () => {
    for (const s of ["CANCELED", "UNPAID", "INCOMPLETE", "INCOMPLETE_EXPIRED", "PAUSED"] as const) {
      expect(tierForStatus(s), s).toBe("FREE");
    }
  });
});

describe("plans", () => {
  it("grants Agency for an Agency subscription, by its tag or its £149 price", () => {
    expect(tierForStatus("ACTIVE", "agency")).toBe("AGENCY");
    expect(tierForStatus("CANCELED", "agency")).toBe("FREE");
    expect(snapshotFromStripe(sub({ metadata: { plan: "agency" } })).plan).toBe("agency");
    expect(snapshotFromStripe(sub({ items: { data: [{ current_period_end: 1, price: { unit_amount: 14900 } }] } })).plan).toBe("agency");
    expect(snapshotFromStripe(sub({ metadata: {} })).plan).toBe("pro"); // untagged (e.g. older) subscriptions are Pro
  });
});

describe("snapshotFromStripe", () => {
  it("maps status, customer and the item-level billing period", () => {
    expect(snapshotFromStripe(sub())).toEqual({
      id: "sub_123",
      customerId: "cus_123",
      plan: "pro",
      status: "ACTIVE",
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });
  it("handles an expanded customer object and older API shapes", () => {
    const s = snapshotFromStripe(
      sub({ customer: { id: "cus_9" }, items: { data: [{}] }, current_period_end: 1_700_000_000, status: "past_due" }),
    );
    expect(s.customerId).toBe("cus_9");
    expect(s.status).toBe("PAST_DUE");
    expect(s.currentPeriodEnd).toEqual(new Date(1_700_000_000 * 1000));
  });
});

describe("verifyStripeEvent", () => {
  const secret = "whsec_unit_test_secret";
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "customer.subscription.updated", created: 1, data: { object: sub() } });

  it("accepts a correctly signed payload", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(verifyStripeEvent(payload, header, secret).id).toBe("evt_1");
  });
  it("rejects a tampered payload, a wrong secret, or a missing header", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => verifyStripeEvent(payload.replace("active", "trialing"), header, secret)).toThrow(InvalidSignatureError);
    expect(() => verifyStripeEvent(payload, header, "whsec_other")).toThrow(InvalidSignatureError);
    expect(() => verifyStripeEvent(payload, null, secret)).toThrow(InvalidSignatureError);
  });
});
