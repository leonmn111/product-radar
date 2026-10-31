import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "a-test-secret-that-is-at-least-32-chars";
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a-test-secret-that-is-at-least-32-chars" } }));
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({ db: { preorderCheck: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));
vi.mock("@/lib/app-url", () => ({ appUrl: () => "https://theproductradar.io" }));
vi.mock("@/server/auth/password", () => ({ clientAddress: (h: Headers) => h.get("x-forwarded-for") }));
vi.mock("@/server/billing/sales", () => ({ creditPacksOnSale: vi.fn(() => true) }));
vi.mock("@/server/billing/stripe", () => ({ BillingNotConfiguredError: class extends Error {} }));
vi.mock("@/server/billing/preorderCheck", () => ({ createPreorderCheckout: vi.fn(async () => "https://checkout.stripe.com/c/pay/cs_test_abc") }));
vi.mock("@/services/dossierCache", () => ({ dbDossierCache: { get: vi.fn() } }));
vi.mock("@/services/preorderReport", () => ({ preorderCheckPath: (id: string) => `/preorder-check/${id}` }));

const { creditPacksOnSale } = await import("@/server/billing/sales");
const { createPreorderCheckout } = await import("@/server/billing/preorderCheck");
const { dbDossierCache } = await import("@/services/dossierCache");
const { signUnlock } = await import("@/server/live/quickToken");
const { POST } = await import("./route");

const claims = { asin: "B0MUG00001", link: "amazon" as const, name: null, brand: null, supplier: { amount: 3.5, source: "you" as const, evidence: null } };
const token = () => signUnlock(claims, SECRET, new Date());
let ip = 0;
const call = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/preorder-check/checkout", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `203.0.113.${++ip}` } }));

beforeEach(() => {
  vi.mocked(creditPacksOnSale).mockReturnValue(true);
  vi.mocked(dbDossierCache.get).mockResolvedValue({ product: { title: "Silicone Kitchen Utensil Set 12 Piece" } } as never);
  vi.mocked(createPreorderCheckout).mockClear();
  findFirst.mockReset().mockResolvedValue(null);
});

describe("POST /api/preorder-check/checkout", () => {
  it("opens a £29 Stripe Checkout for the signed product and the buyer's email", async () => {
    const res = await call({ token: token(), email: " Me@Shop.TEST " });
    expect([res.status, await res.json()]).toEqual([200, { url: "https://checkout.stripe.com/c/pay/cs_test_abc" }]);
    expect(createPreorderCheckout).toHaveBeenCalledWith(expect.anything(), {
      email: "me@shop.test",
      claims,
      productTitle: "Silicone Kitchen Utensil Set 12 Piece",
      baseUrl: "https://theproductradar.io",
    });
  });

  it("never charges twice: an email that already bought this product goes back to its check", async () => {
    findFirst.mockResolvedValue({ stripeSessionId: "cs_test_paid" });
    expect(await (await call({ token: token(), email: "me@shop.test" })).json()).toEqual({ url: "/preorder-check/cs_test_paid", alreadyPaid: true });
    expect(createPreorderCheckout).not.toHaveBeenCalled();
  });

  it("refuses a bad email, an edited or expired check, and anything while it isn't on sale, before Stripe is asked", async () => {
    expect((await call({ token: token(), email: "nope" })).status).toBe(400);
    expect((await call({ token: `${token()}x`, email: "me@shop.test" })).status).toBe(410);
    vi.mocked(dbDossierCache.get).mockResolvedValue(null);
    expect((await call({ token: token(), email: "me@shop.test" })).status).toBe(410);
    vi.mocked(creditPacksOnSale).mockReturnValue(false);
    expect((await call({ token: token(), email: "me@shop.test" })).status).toBe(503);
    expect(createPreorderCheckout).not.toHaveBeenCalled();
  });
});
