import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { checkoutSessionParams, CREDIT_PACKS, CREDIT_VALUE_PENCE, creditGrantFor, PLANS, planPriceLabel, STANDARD_DOSSIER_CREDITS } from "./plans";

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
  it("has the three credit packs, Pro at £29 and Agency at £149 a month", () => {
    expect(Object.values(CREDIT_PACKS).map((p) => [p.name, p.pricePence, p.credits])).toEqual([
      ["Starter Pack", 1000, 20],
      ["Growth Pack", 2500, 55],
      ["Scale Pack", 5000, 120],
    ]);
    expect([PLANS.pro.pricePence, PLANS.pro.tier, PLANS.agency.pricePence, PLANS.agency.tier]).toEqual([2900, "PRO", 14900, "AGENCY"]);
    expect([planPriceLabel(PLANS.pro), planPriceLabel(PLANS.agency)]).toEqual(["£29/month", "£149/month"]);
  });

  it("prices a credit at £0.50, so a Standard Dossier is 4 credits (£2) without a plan and 1 on Pro", () => {
    expect(CREDIT_VALUE_PENCE).toBe(50);
    expect(STANDARD_DOSSIER_CREDITS).toEqual({ FREE: 4, PRO: 1, AGENCY: 1 });
    expect(STANDARD_DOSSIER_CREDITS.FREE * CREDIT_VALUE_PENCE).toBe(200);
    expect(CREDIT_PACKS.starter.pricePence / CREDIT_PACKS.starter.credits).toBe(CREDIT_VALUE_PENCE); // bigger packs add bonus credits
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
    expect(p.subscription_data?.metadata).toEqual({ userId: "u1", plan: "pro" });
    expect(p.success_url).toBe("https://theproductradar.io/billing/success?session_id={CHECKOUT_SESSION_ID}");
  });

  it("sells Agency as a £149 monthly subscription tagged with its plan", () => {
    const p = checkoutSessionParams("agency", ctx);
    expect(p.line_items?.[0].price_data).toMatchObject({ unit_amount: 14900, recurring: { interval: "month" }, product_data: { name: "ProductRadar Agency" } });
    expect(p.subscription_data?.metadata).toEqual({ userId: "u1", plan: "agency" });
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
