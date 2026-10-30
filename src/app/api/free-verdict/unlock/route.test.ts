import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkResellability } from "@/engine/compliance";
import type { Dossier, Evidence } from "@/types/dossier";

const SECRET = "a-test-secret-that-is-at-least-32-chars";
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a-test-secret-that-is-at-least-32-chars" } }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/server/auth/password", () => ({ clientAddress: (h: Headers) => h.get("x-forwarded-for") }));
vi.mock("@/services/dossierCache", () => ({ dbDossierCache: { get: vi.fn() } }));
const unlock = vi.fn();
vi.mock("@/services/leads", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/leads")>()), dbLeadStore: () => ({ unlock }) }));

const { dbDossierCache } = await import("@/services/dossierCache");
const { signUnlock } = await import("@/server/live/quickToken");
const { POST } = await import("./route");

const listing = (n: number, price: number): Evidence => ({
  id: `rainforest:amazon.co.uk:B0MUG0000${n}`,
  provider: "rainforest",
  sourceType: "marketplace",
  sourceUrl: `https://www.amazon.co.uk/dp/B0MUG0000${n}`,
  observedAt: new Date().toISOString(),
  publishedAt: null,
  quality: 90,
  claim: `Listed at £${price.toFixed(2)}`,
  value: price,
});
const DOSSIER = {
  product: { title: "Silicone Kitchen Utensil Set 12 Piece", identifiers: { asin: "B0MUG00001" } },
  evidence: [19.99, 21.99, 22.49, 24.99].map((p, i) => listing(i + 1, p)),
  resellability: checkResellability({ title: "Silicone Kitchen Utensil Set 12 Piece", market: "UK" }),
  supplierMatches: [],
} as unknown as Dossier;
const token = () => signUnlock({ asin: "B0MUG00001", link: "amazon", name: null, brand: null, supplier: { amount: 3.5, source: "you", evidence: null } }, SECRET, new Date());
let ip = 0;
const call = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/free-verdict/unlock", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `203.0.113.${++ip}` } }));

beforeEach(() => {
  vi.mocked(dbDossierCache.get).mockReset().mockResolvedValue(DOSSIER);
  unlock.mockReset().mockResolvedValue({ ok: true, freeLeft: 2 });
});

describe("POST /api/free-verdict/unlock", () => {
  it("records the email and returns the full breakdown, rebuilt from the cached Dossier", async () => {
    const res = await call({ token: token(), email: " Me@Shop.TEST ", marketing: true });
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(unlock).toHaveBeenCalledWith("me@shop.test", "amazon.co.uk:B0MUG00001", true, expect.any(Date));
    expect(b).toMatchObject({ keepPerSale: 10.08, breakEvenAdCost: 10.08, worstCase: { stock: 35, adBudget: 100.8, total: 135.8 }, freeLeft: 2 });
    expect(b.adTestPlan).toHaveLength(3);
  });

  it("says when the free breakdowns are used, with the way to an account", async () => {
    unlock.mockResolvedValue({ ok: false, reason: "limit_reached" });
    const res = await call({ token: token(), email: "me@shop.test" });
    expect([res.status, (await res.json()).error]).toEqual([402, "free_breakdowns_used"]);
  });

  it("refuses a bad email, an edited or expired token, or a check whose Dossier left the cache, recording nothing", async () => {
    expect((await call({ token: token(), email: "not-an-email" })).status).toBe(400);
    expect((await call({ token: `${token()}x`, email: "me@shop.test" })).status).toBe(410);
    vi.mocked(dbDossierCache.get).mockResolvedValue(null);
    expect((await call({ token: token(), email: "me@shop.test" })).status).toBe(410);
    expect(unlock).not.toHaveBeenCalled();
  });
});
