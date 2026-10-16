// The Stripe webhook at /api/stripe/webhook, with real Stripe signatures (made with a test secret).
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

const SECRET = "whsec_test_secret_for_signatures";
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env: { STRIPE_WEBHOOK_SECRET: "whsec_test_secret_for_signatures" } }));
vi.mock("@/lib/db", () => ({ db: { user: { updateMany: vi.fn(async () => ({ count: 1 })) } } }));

const { creditStore } = await import("@/server/billing/credits");
const { POST } = await import("./route");

let n = 0;
const completed = (session: Record<string, unknown>) =>
  JSON.stringify({ id: `evt_${++n}`, object: "event", type: "checkout.session.completed", created: 1_800_000_000, data: { object: { object: "checkout.session", ...session } } });
const send = (payload: string, secret = SECRET) =>
  POST(
    new Request("http://localhost:3457/api/stripe/webhook", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret }) },
    }),
  );
const pack = (over: Record<string, unknown> = {}) => ({
  id: "cs_test_growth",
  mode: "payment",
  payment_status: "paid",
  amount_total: 2500,
  currency: "gbp",
  client_reference_id: "user_1",
  metadata: { kind: "credit_pack", pack: "growth", credits: "55", userId: "user_1" },
  ...over,
});

describe("POST /api/stripe/webhook", () => {
  it("credits a paid Growth Pack once, however often Stripe delivers it", async () => {
    const first = await send(completed(pack()));
    expect(await first.json()).toEqual({ received: true, type: "checkout.session.completed", result: "credited" });
    const again = await send(completed(pack()));
    expect((await again.json()).result).toBe("already_credited");
    expect(await creditStore.balance("user_1")).toBe(55);
  });

  it("credits nothing for a session whose amount doesn't match the pack", async () => {
    const res = await send(completed(pack({ id: "cs_test_cheap", amount_total: 100 })));
    expect(await res.json()).toMatchObject({ result: "ignored", reason: "amount_mismatch" });
    expect(await creditStore.balance("user_1")).toBe(55);
  });

  it("still links a subscription checkout to its customer, as before", async () => {
    const res = await send(completed({ id: "cs_test_sub", mode: "subscription", customer: "cus_1", client_reference_id: "user_2" }));
    expect((await res.json()).result).toBe("linked");
  });

  it("refuses an event that Stripe didn't sign", async () => {
    const res = await send(completed(pack({ id: "cs_forged" })), "whsec_someone_else");
    expect(res.status).toBe(400);
    expect(await creditStore.balance("user_1")).toBe(55);
  });
});
