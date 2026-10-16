// POST /api/dossier/{asin}: a Standard Dossier paid in platform credits. The real ledger code, the
// real cache and the real Dossier builder, over an in-memory stand-in for PostgreSQL that rolls a
// failed transaction back as the database does. The data sources are fakes (no paid provider calls).

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetailListing, RetailProductDetail, SupplierOffer } from "@/server/live/types";
import type { RetailSource, SupplierSource } from "@/server/sources/types";

const mem = vi.hoisted(() => ({
  users: new Map<string, { platformCredits: number }>(),
  ledger: [] as Record<string, unknown>[],
  cache: new Map<string, { dossier: unknown; expiresAt: Date }>(),
  records: new Map<string, unknown>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/server/auth/entitlements", () => ({ getViewer: vi.fn() }));
vi.mock("@/server/live/config", () => ({ liveSources: vi.fn() }));
vi.mock("@/lib/db", () => {
  type Change = { platformCredits: { increment?: number; decrement?: number } };
  const db = {
    user: {
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; platformCredits?: { gte: number } }; data: Change }) => {
        const u = mem.users.get(where.id);
        if (!u || (where.platformCredits && u.platformCredits < where.platformCredits.gte)) return { count: 0 };
        u.platformCredits += (data.platformCredits.increment ?? 0) - (data.platformCredits.decrement ?? 0);
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...mem.users.get(where.id)! })),
    },
    creditLedgerEntry: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (mem.ledger.push(data), data)) },
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const users = new Map([...mem.users].map(([k, v]) => [k, { ...v }]));
      const ledger = [...mem.ledger];
      try {
        return await fn(db);
      } catch (e) {
        mem.users = users;
        mem.ledger = ledger;
        throw e;
      }
    },
    dossierCache: {
      findUnique: vi.fn(async ({ where }: { where: { marketplace_productId: { productId: string } } }) => mem.cache.get(where.marketplace_productId.productId) ?? null),
      upsert: vi.fn(async ({ where, create }: { where: { marketplace_productId: { productId: string } }; create: { dossier: unknown; expiresAt: Date } }) =>
        mem.cache.set(where.marketplace_productId.productId, create),
      ),
    },
    dossierRecord: { create: vi.fn(async ({ data }: { data: { id: string; body: unknown } }) => mem.records.set(data.id, data.body)) },
  };
  return { db };
});

const { getViewer } = await import("@/server/auth/entitlements");
const { liveSources } = await import("@/server/live/config");
const { SourceError } = await import("@/server/sources/types");
const { POST } = await import("./route");

const SITE = "http://localhost:3457";
const ASIN = "B0TESTMUG1";
const now = () => new Date().toISOString();
const listing = (id: string): RetailListing => ({
  market: "GB",
  id,
  title: "Plain White Ceramic Coffee Mug 350ml",
  url: `https://www.amazon.co.uk/dp/${id}`,
  image: null,
  price: { amount: 12.99, currency: "GBP" },
  rating: null,
  ratingsTotal: null,
  sponsored: false,
  recentSales: null,
  evidence: { id: `rainforest:amazon.co.uk:${id}`, provider: "rainforest", sourceUrl: `https://www.amazon.co.uk/dp/${id}`, observedAt: now(), quality: 90, claim: "Listed at £12.99" },
});
const page = (): RetailProductDetail => ({ listing: listing(ASIN), brand: null, sellerName: "Mug Traders Ltd", soldByAmazon: false, category: null, bulletPoints: [], description: null });
const offer = (n: number): SupplierOffer => ({
  id: `ae${n}`,
  title: "Ceramic Coffee Mug 350ml Plain White",
  url: `https://www.aliexpress.com/item/${n}.html`,
  image: null,
  unitPrice: { amount: 2.1, currency: "GBP" },
  shipping: null,
  shipsTo: "GB",
  evidence: { id: `aliexpress:${n}`, provider: "aliexpress", sourceUrl: `https://www.aliexpress.com/item/${n}.html`, observedAt: now(), quality: 80, claim: "Offered" },
});
const retail: RetailSource = {
  name: "rainforest (test)",
  product: vi.fn(async (id: string) => (id.startsWith("B0TESTMUG") ? page() : null)),
  search: vi.fn(async () => ["B0TESTMUG2", "B0TESTMUG3", "B0TESTMUG4"].map(listing)),
};
const supplier: SupplierSource = { name: "aliexpress (test)", search: vi.fn(async () => [offer(1), offer(2)]) };

let n = 0;
/** A signed-in user with this many credits. */
function viewer(credits: number, tier: "FREE" | "PRO" | "AGENCY" = "FREE") {
  const id = `user_${++n}`;
  mem.users.set(id, { platformCredits: credits });
  vi.mocked(getViewer).mockResolvedValue({ id, email: "me@example.com", tier });
  return id;
}
const call = (asin = ASIN) =>
  POST(new NextRequest(`${SITE}/api/dossier/${asin}`, { method: "POST", headers: { origin: SITE, host: "localhost:3457" } }), {
    params: Promise.resolve({ asin }),
  });
const credits = (id: string) => mem.users.get(id)?.platformCredits;

describe("POST /api/dossier/{asin}", () => {
  beforeEach(() => {
    vi.mocked(liveSources).mockReturnValue({ ready: true, sample: false, sources: { retail, supplier } });
    mem.cache.clear();
    vi.mocked(retail.product).mockClear();
  });

  it("charges 4 credits (£2) without a plan, records the spend, and builds and caches the Dossier", async () => {
    const user = viewer(10);
    const res = await call();
    expect([res.status, res.headers.get("x-credits-charged"), res.headers.get("x-credits-remaining"), res.headers.get("x-dossier-cache")]).toEqual([200, "4", "6", "miss"]);
    const d = await res.json();
    expect(d.product.identifiers.asin).toBe(ASIN);
    expect(d.landedMargin.status).toBe("shown");
    expect(credits(user)).toBe(6);
    expect(mem.ledger.at(-1)).toEqual({ userId: user, kind: "SPEND", delta: -4, balanceAfter: 6, reference: d.id });
    expect(mem.cache.has(ASIN)).toBe(true);
    expect(mem.records.get(d.id)).toEqual(d);
  });

  it("serves the next request from the cache, without calling a provider, for the same price", async () => {
    viewer(10);
    await call();
    vi.mocked(retail.product).mockClear();
    const user = viewer(10);
    const res = await call();
    expect([res.status, res.headers.get("x-dossier-cache"), res.headers.get("x-credits-charged")]).toEqual([200, "hit", "4"]);
    expect(retail.product).not.toHaveBeenCalled();
    expect(credits(user)).toBe(6);
  });

  it("charges Pro and Agency 1 credit", async () => {
    for (const tier of ["PRO", "AGENCY"] as const) {
      const user = viewer(1, tier);
      expect((await call()).headers.get("x-credits-charged")).toBe("1");
      expect(credits(user)).toBe(0);
    }
  });

  it("says how many credits are missing, and does no work, when the balance is too low", async () => {
    const user = viewer(3);
    const res = await call();
    expect([res.status, await res.json()]).toEqual([402, expect.objectContaining({ error: "insufficient_credits", needed: 4, balance: 3 })]);
    expect(retail.product).not.toHaveBeenCalled();
    expect(credits(user)).toBe(3);
  });

  it("can't spend one balance twice with two requests at once", async () => {
    const user = viewer(4);
    const statuses = (await Promise.all([call(), call()])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 402]);
    expect(credits(user)).toBe(0);
  });

  it("returns the credits when the product doesn't exist or a source fails", async () => {
    const user = viewer(8);
    const missing = await call("B0NOTHERE1");
    expect([missing.status, (await missing.json()).message]).toEqual([404, "Amazon UK has no priced product B0NOTHERE1. Your 4 credits were returned."]);
    vi.mocked(retail.product).mockRejectedValueOnce(new SourceError("rainforest", "timed out"));
    expect((await call()).status).toBe(502);
    expect(credits(user)).toBe(8);
    expect(mem.ledger.filter((e) => e.userId === user).map((e) => [e.kind, e.delta, e.balanceAfter])).toEqual([
      ["SPEND", -4, 4],
      ["REFUND", 4, 8],
      ["SPEND", -4, 4],
      ["REFUND", 4, 8],
    ]);
  });

  it("checks sign-in, the ASIN and live sources before taking anything", async () => {
    vi.mocked(getViewer).mockResolvedValueOnce(null);
    expect((await call()).status).toBe(401);
    const user = viewer(10);
    expect((await call("nope")).status).toBe(400);
    vi.mocked(liveSources).mockReturnValueOnce({ ready: false, missing: ["supplier source"] });
    expect((await call()).status).toBe(503);
    expect(credits(user)).toBe(10);
  });
});
