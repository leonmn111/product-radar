import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/db", () => ({ db: { marker: "db" } }));
vi.mock("@/server/auth/entitlements", () => ({ getViewer: vi.fn() }));
vi.mock("@/server/billing/checkout", () => ({ existingCustomerPortalUrl: vi.fn() }));

const { getViewer } = await import("@/server/auth/entitlements");
const { existingCustomerPortalUrl } = await import("@/server/billing/checkout");
const { BillingNotConfiguredError } = await import("@/server/billing/stripe");
const { POST } = await import("./route");

const SITE = "http://localhost:3457";
const call = (headers: Record<string, string> = { origin: SITE, host: "localhost:3457" }) =>
  POST(new NextRequest(`${SITE}/api/billing/portal`, { method: "POST", headers }));
let n = 0;
const signedIn = () => vi.mocked(getViewer).mockResolvedValue({ id: `u${++n}`, email: "me@example.com", tier: "PRO" });

describe("POST /api/billing/portal", () => {
  beforeEach(() => vi.mocked(existingCustomerPortalUrl).mockReset());

  it("returns the Stripe portal URL for a customer, coming back to /account", async () => {
    signedIn();
    vi.mocked(existingCustomerPortalUrl).mockResolvedValue("https://billing.stripe.com/p/session/test_123");
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://billing.stripe.com/p/session/test_123" });
    expect(vi.mocked(existingCustomerPortalUrl).mock.calls[0].slice(1)).toEqual([`u${n}`, SITE]);
  });

  it("needs a signed-in user", async () => {
    vi.mocked(getViewer).mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(existingCustomerPortalUrl).not.toHaveBeenCalled();
  });

  it("points someone who never subscribed to the upgrade instead", async () => {
    signedIn();
    vi.mocked(existingCustomerPortalUrl).mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_billing_account");
  });

  it("refuses requests from other sites", async () => {
    signedIn();
    const res = await call({ origin: "https://evil.example", host: "localhost:3457" });
    expect(res.status).toBe(403);
    expect(existingCustomerPortalUrl).not.toHaveBeenCalled();
  });

  it("says when billing isn't set up, and hides other errors behind a friendly message", async () => {
    signedIn();
    vi.mocked(existingCustomerPortalUrl).mockRejectedValueOnce(new BillingNotConfiguredError());
    expect((await call()).status).toBe(503);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(existingCustomerPortalUrl).mockRejectedValueOnce(new Error("stripe down"));
    const res = await call();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("stripe down");
    quiet.mockRestore();
  });

  it("limits each account to 10 portal sessions a minute", async () => {
    signedIn();
    vi.mocked(existingCustomerPortalUrl).mockResolvedValue("https://billing.stripe.com/p/session/x");
    for (let i = 0; i < 10; i++) expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);
  });
});
