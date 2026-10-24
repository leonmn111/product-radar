import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/app-url", () => ({ appUrl: () => "https://theproductradar.io" }));
vi.mock("@/server/auth/entitlements", () => ({ getViewer: vi.fn() }));
vi.mock("@/server/billing/stripe", () => ({ BillingNotConfiguredError: class extends Error {} }));
vi.mock("@/server/billing/checkout", () => ({ createCheckoutUrl: vi.fn() }));

const { getViewer } = await import("@/server/auth/entitlements");
const { createCheckoutUrl } = await import("@/server/billing/checkout");
const { GET } = await import("./route");

const call = (headers: Record<string, string> = {}) => GET(new NextRequest("https://theproductradar.io/upgrade", { headers }));

beforeEach(() => {
  vi.mocked(getViewer).mockResolvedValue({ id: "user-1", tier: "FREE" } as never);
  vi.mocked(createCheckoutUrl).mockReset().mockResolvedValue("https://checkout.stripe.com/c/pay/cs_test_123");
});

describe("GET /upgrade", () => {
  it("never opens Checkout (or creates a Stripe customer) for a prefetch", async () => {
    const prefetches: Record<string, string>[] = [{ "next-router-prefetch": "1", rsc: "1" }, { "sec-purpose": "prefetch" }, { purpose: "prefetch" }];
    for (const headers of prefetches) {
      expect((await call(headers)).status).toBe(204);
    }
    expect(createCheckoutUrl).not.toHaveBeenCalled();
  });

  it("sends a real click to Stripe Checkout", async () => {
    const res = await call();
    expect([res.status, res.headers.get("location")]).toEqual([303, "https://checkout.stripe.com/c/pay/cs_test_123"]);
    expect(createCheckoutUrl).toHaveBeenCalledOnce();
  });
});
