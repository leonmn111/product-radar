import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ NODE_ENV: "development" as string, STRIPE_SECRET_KEY: "sk_test_x" as string }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/db", () => ({ db: { marker: "db" } }));
vi.mock("@/server/auth/entitlements", () => ({ getViewer: vi.fn() }));
vi.mock("@/server/billing/checkout", () => ({ createPlanCheckoutUrl: vi.fn(async () => "https://checkout.stripe.com/c/pay/cs_test_1") }));

const { getViewer } = await import("@/server/auth/entitlements");
const { createPlanCheckoutUrl } = await import("@/server/billing/checkout");
const { BillingNotConfiguredError } = await import("@/server/billing/stripe");
const { POST } = await import("./route");

const SITE = "http://localhost:3457";
const call = (body: unknown, headers: Record<string, string> = { origin: SITE, host: "localhost:3457" }) =>
  POST(new NextRequest(`${SITE}/api/stripe/checkout`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } }));
let n = 0;
const signedIn = () => vi.mocked(getViewer).mockResolvedValue({ id: `u${++n}`, email: "me@example.com", tier: "FREE" });

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    Object.assign(env, { NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_test_x" });
    vi.mocked(createPlanCheckoutUrl).mockClear();
  });

  it("returns a Stripe Checkout URL for each tier", async () => {
    for (const tier of ["starter", "growth", "scale", "pro"]) {
      signedIn();
      const res = await call({ tier });
      expect([res.status, (await res.json()).url]).toEqual([200, "https://checkout.stripe.com/c/pay/cs_test_1"]);
      expect(vi.mocked(createPlanCheckoutUrl).mock.calls.at(-1)?.slice(1)).toEqual([`u${n}`, SITE, tier]);
    }
  });

  it.each([
    ["in production", { NODE_ENV: "production" }],
    ["with a live Stripe key, even in development", { STRIPE_SECRET_KEY: "rk_live_x" }],
    ["without a Stripe key", { STRIPE_SECRET_KEY: "" }],
  ])("isn't on sale %s, before anything else is checked", async (_label, over) => {
    Object.assign(env, over);
    signedIn();
    const res = await call({ tier: "starter" });
    expect([res.status, (await res.json()).error]).toEqual([503, "not_on_sale"]);
    expect(createPlanCheckoutUrl).not.toHaveBeenCalled();
  });

  it("rejects an unknown tier, a signed-out visitor and other sites", async () => {
    signedIn();
    expect((await call({ tier: "platinum" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    vi.mocked(getViewer).mockResolvedValue(null);
    expect((await call({ tier: "starter" })).status).toBe(401);
    signedIn();
    expect((await call({ tier: "starter" }, { origin: "https://evil.example", host: "localhost:3457" })).status).toBe(403);
    expect(createPlanCheckoutUrl).not.toHaveBeenCalled();
  });

  it("says when billing isn't configured", async () => {
    signedIn();
    vi.mocked(createPlanCheckoutUrl).mockRejectedValueOnce(new BillingNotConfiguredError());
    expect((await call({ tier: "scale" })).status).toBe(503);
  });
});
