import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PREORDER_CHECK, preorderCheckSessionParams, preorderPaymentFor } from "./plans";
import { handleStripeEvent } from "./webhook";

const checkout = {
  checkId: "0199a0a0-0000-7000-8000-000000000029",
  email: "me@shop.test",
  asin: "B0MUG00001",
  productTitle: "Silicone Kitchen Utensil Set 12 Piece",
  productUrl: "https://www.amazon.co.uk/dp/B0MUG00001",
  supplierPrice: 3.5,
  supplierSource: "you",
  baseUrl: "https://theproductradar.io",
};
const session = (over: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: "cs_test_preorder1",
    mode: "payment",
    payment_status: "paid",
    amount_total: 2900,
    currency: "gbp",
    metadata: { kind: "preorder_check", checkId: checkout.checkId },
    ...over,
  }) as Stripe.Checkout.Session;

describe("the £29 Pre-order Check's Checkout Session", () => {
  it("is a one-off £29 GBP payment with the buyer's email, and says which check to unlock", () => {
    const p = preorderCheckSessionParams(checkout);
    expect(PREORDER_CHECK.pricePence).toBe(2900);
    expect(p).toMatchObject({
      mode: "payment",
      customer_email: "me@shop.test",
      client_reference_id: checkout.checkId,
      line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: 2900, product_data: { name: "ProductRadar Pre-order Check" } } }],
      metadata: { kind: "preorder_check", checkId: checkout.checkId, asin: "B0MUG00001", productUrl: checkout.productUrl, supplierPrice: "3.50", email: "me@shop.test" },
      success_url: "https://theproductradar.io/preorder-check/{CHECKOUT_SESSION_ID}",
      cancel_url: "https://theproductradar.io/#check",
    });
    // Nothing optional is added on the buyer's behalf: no subscription, no extra items, no promotion fields.
    expect(p.line_items).toHaveLength(1);
    expect(p).not.toHaveProperty("subscription_data");
  });

  it("unlocks only for a paid session of exactly £29 in GBP", () => {
    expect(preorderPaymentFor(session())).toEqual({ checkId: checkout.checkId, sessionId: "cs_test_preorder1" });
    expect(preorderPaymentFor(session({ payment_status: "unpaid" }))).toEqual({ checkId: null, reason: "not_paid" });
    expect(preorderPaymentFor(session({ amount_total: 100 }))).toEqual({ checkId: null, reason: "amount_mismatch" });
    expect(preorderPaymentFor(session({ currency: "usd" }))).toEqual({ checkId: null, reason: "amount_mismatch" });
    expect(preorderPaymentFor(session({ metadata: { kind: "credit_pack" } }))).toEqual({ checkId: null, reason: "not_a_preorder_check" });
  });
});

describe("the webhook, for a Pre-order Check", () => {
  function fakeDb() {
    const row = { id: checkout.checkId, email: "me@shop.test", asin: "B0MUG00001", claims: { asin: "B0MUG00001" }, status: "PENDING" as string };
    const db = {
      preorderCheck: {
        updateMany: vi.fn(async ({ where }: { where: { id: string; status: string } }) => {
          if (where.id === row.id && row.status === where.status) {
            row.status = "PAID";
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === row.id ? row : null)),
      },
    } as unknown as PrismaClient;
    return { db, row };
  }
  const event = (s: Stripe.Checkout.Session) => ({ id: "evt_1", type: "checkout.session.completed", created: 1, data: { object: s } }) as unknown as Stripe.Event;

  it("unlocks the check once and sends its report and receipt once, however often Stripe delivers it", async () => {
    const { db, row } = fakeDb();
    const onPreorderPaid = vi.fn(async () => {});
    expect(await handleStripeEvent(db, event(session()), undefined, { onPreorderPaid })).toEqual({ type: "checkout.session.completed", result: "unlocked" });
    expect(row.status).toBe("PAID");
    expect(onPreorderPaid).toHaveBeenCalledWith(expect.objectContaining({ id: checkout.checkId, email: "me@shop.test", stripeSessionId: "cs_test_preorder1" }));
    expect(await handleStripeEvent(db, event(session()), undefined, { onPreorderPaid })).toEqual({ type: "checkout.session.completed", result: "already_unlocked" });
    expect(onPreorderPaid).toHaveBeenCalledTimes(1);
  });

  it("unlocks nothing for an unpaid or wrong-amount session", async () => {
    const { db, row } = fakeDb();
    const r = await handleStripeEvent(db, event(session({ amount_total: 900 })), undefined, {});
    expect(r).toEqual({ type: "checkout.session.completed", result: "ignored", reason: "amount_mismatch" });
    expect(row.status).toBe("PENDING");
  });
});
