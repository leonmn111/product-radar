import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createMockCreditStore } from "./credits";
import { checkoutSessionParams, CREDIT_PACKS, creditGrantFor, PRO_SUBSCRIPTION } from "./plans";

const ctx = { userId: "u1", customerId: "cus_1", baseUrl: "https://theproductradar.io" };

const session = (over: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: "cs_test_1",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    amount_total: 1000,
    currency: "gbp",
    client_reference_id: "u1",
    metadata: { kind: "credit_pack", pack: "starter", credits: "20", userId: "u1" },
    ...over,
  }) as Stripe.Checkout.Session;

describe("the plan catalogue", () => {
  it("has the three credit packs and the £29 Pro subscription", () => {
    expect(Object.values(CREDIT_PACKS).map((p) => [p.name, p.pricePence, p.credits])).toEqual([
      ["Starter Pack", 1000, 20],
      ["Growth Pack", 2500, 55],
      ["Scale Pack", 5000, 120],
    ]);
    expect(PRO_SUBSCRIPTION).toMatchObject({ pricePence: 2900, interval: "month", monthlyFreeSearches: 100, standardDossierCredits: 1 });
  });
});

describe("checkoutSessionParams", () => {
  it("sells a pack as a one-off GBP payment, tagged with the pack and the buyer", () => {
    const p = checkoutSessionParams("growth", ctx);
    expect(p).toMatchObject({
      mode: "payment",
      customer: "cus_1",
      client_reference_id: "u1",
      metadata: { kind: "credit_pack", pack: "growth", credits: "55", userId: "u1" },
      success_url: "https://theproductradar.io/account?checkout=credits",
      cancel_url: "https://theproductradar.io/account?checkout=cancelled",
    });
    expect(p.line_items).toEqual([
      { quantity: 1, price_data: { currency: "gbp", unit_amount: 2500, product_data: { name: "ProductRadar Growth Pack", description: "55 platform credits." } } },
    ]);
  });

  it("sells Pro as a £29 monthly subscription", () => {
    const p = checkoutSessionParams("pro", ctx);
    expect(p.mode).toBe("subscription");
    expect(p.line_items?.[0].price_data).toMatchObject({ currency: "gbp", unit_amount: 2900, recurring: { interval: "month" } });
    expect(p.subscription_data?.metadata).toEqual({ userId: "u1", plan: "pro_v2" });
    expect(p.success_url).toBe("https://theproductradar.io/billing/success?session_id={CHECKOUT_SESSION_ID}");
  });
});

describe("creditGrantFor", () => {
  it("grants the catalogue's credits for a paid pack", () => {
    expect(creditGrantFor(session())).toEqual({ grant: { userId: "u1", packId: "starter", credits: 20, sessionId: "cs_test_1" } });
  });

  it("takes the credit count from the catalogue, never from the session", () => {
    expect(creditGrantFor(session({ metadata: { kind: "credit_pack", pack: "starter", credits: "9999", userId: "u1" } }))).toMatchObject({ grant: { credits: 20 } });
  });

  it.each([
    ["an unpaid session", { payment_status: "unpaid" }, "not_paid"],
    ["a subscription", { mode: "subscription" }, "not_a_credit_pack"],
    ["an unknown pack", { metadata: { kind: "credit_pack", pack: "toString" } }, "unknown_pack"],
    ["a different amount", { amount_total: 1 }, "amount_mismatch"],
    ["another currency", { currency: "usd" }, "amount_mismatch"],
    ["no buyer", { client_reference_id: null, metadata: { kind: "credit_pack", pack: "starter" } }, "no_user"],
  ])("grants nothing for %s", (_label, over, reason) => {
    expect(creditGrantFor(session(over as Partial<Stripe.Checkout.Session>))).toEqual({ grant: null, reason });
  });
});

describe("the mock credit store", () => {
  it("credits each Stripe session once and adds up a user's balance", async () => {
    const store = createMockCreditStore();
    const g = { userId: "u1", packId: "starter" as const, credits: 20, sessionId: "cs_1" };
    expect(await store.grant(g)).toBe(true);
    expect(await store.grant(g)).toBe(false);
    expect(await store.grant({ ...g, packId: "scale", credits: 120, sessionId: "cs_2" })).toBe(true);
    expect([await store.balance("u1"), await store.balance("u2"), store.kind]).toEqual([140, 0, "mock"]);
  });
});
