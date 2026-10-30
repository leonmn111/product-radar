// POST /api/search: the real route, credit code and free-search counter, over an in-memory stand-in
// for PostgreSQL. The retail source is a fake (no Rainforest calls).
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetailListing } from "@/server/live/types";

type Row = Record<string, unknown>;
const mem = vi.hoisted(() => ({
  users: new Map<string, { platformCredits: number; subscriptionTier: string; subscriptionCurrentPeriodEnd: Date | null }>(),
  ledger: [] as Row[],
  usage: [] as { userId: string; free: boolean; createdAt: Date }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/server/auth/entitlements", () => ({ getViewer: vi.fn() }));
vi.mock("@/server/live/config", () => ({ liveRetailSource: vi.fn() }));
vi.mock("@/lib/db", () => {
  type Change = { platformCredits: { increment?: number; decrement?: number } };
  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (mem.users.has(where.id) ? { ...mem.users.get(where.id)! } : null)),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...mem.users.get(where.id)! })),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; platformCredits?: { gte: number } }; data: Change }) => {
        const u = mem.users.get(where.id);
        if (!u || (where.platformCredits && u.platformCredits < where.platformCredits.gte)) return { count: 0 };
        u.platformCredits += (data.platformCredits.increment ?? 0) - (data.platformCredits.decrement ?? 0);
        return { count: 1 };
      }),
    },
    creditLedgerEntry: { create: vi.fn(async ({ data }: { data: Row }) => (mem.ledger.push(data), data)) },
    searchUsage: {
      count: vi.fn(async ({ where }: { where: { userId: string; free: boolean; createdAt: { gte: Date } } }) =>
        mem.usage.filter((u) => u.userId === where.userId && u.free === where.free && u.createdAt >= where.createdAt.gte).length,
      ),
      create: vi.fn(async ({ data }: { data: { userId: string; free: boolean } }) => mem.usage.push({ ...data, createdAt: new Date() })),
    },
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  return { db };
});

const { getViewer } = await import("@/server/auth/entitlements");
const { liveRetailSource } = await import("@/server/live/config");
const { SourceError } = await import("@/server/sources/types");
const { POST } = await import("./route");

const now = () => new Date().toISOString();
const listing = (id: string, title = "Plain White Ceramic Coffee Mug 350ml"): RetailListing => ({
  market: "GB", id, title, url: `https://www.amazon.co.uk/dp/${id}`, image: null, price: { amount: 12.99, currency: "GBP" }, rating: 4.4, ratingsTotal: 120, sponsored: false, recentSales: null,
  evidence: { id: `rainforest:amazon.co.uk:${id}`, provider: "rainforest", sourceUrl: `https://www.amazon.co.uk/dp/${id}`, observedAt: now(), quality: 80, claim: "Listed at £12.99" },
});
const search = vi.fn(async (): Promise<RetailListing[]> => [listing("B0MUGAAAA1"), listing("B0MUGAAAA2"), listing("B0FLASKAA1", "Stainless Steel Travel Flask 500ml")]);
const retail = { name: "rainforest (test)", search, product: vi.fn(async () => null) };

let n = 0;
function user(tier: string, credits: number) {
  const id = `user_${++n}`;
  mem.users.set(id, { platformCredits: credits, subscriptionTier: tier, subscriptionCurrentPeriodEnd: null });
  vi.mocked(getViewer).mockResolvedValue({ id, email: "me@example.com", tier: tier as "FREE" });
  return id;
}
const call = (q: unknown) =>
  POST(new NextRequest("http://localhost:3457/api/search", { method: "POST", body: JSON.stringify({ q }), headers: { origin: "http://localhost:3457", host: "localhost:3457", "content-type": "application/json" } }));
const credits = (id: string) => mem.users.get(id)!.platformCredits;

describe("POST /api/search", () => {
  beforeEach(() => {
    vi.mocked(liveRetailSource).mockReturnValue({ ready: true, sample: false, retail });
    search.mockClear();
  });

  it("charges 1 credit without Pro, and returns products grouped from the listings, each with its evidence", async () => {
    const id = user("FREE", 3);
    const res = await call("ceramic mug");
    expect([res.status, res.headers.get("x-credits-charged"), res.headers.get("x-credits-remaining")]).toEqual([200, "1", "2"]);
    const body = await res.json();
    expect(body.results.map((r: { asin: string; sameProductListings: number }) => [r.asin, r.sameProductListings])).toEqual([
      ["B0MUGAAAA1", 2],
      ["B0FLASKAA1", 1],
    ]);
    expect(body.results[0].evidence).toMatchObject({ provider: "rainforest", sourceUrl: "https://www.amazon.co.uk/dp/B0MUGAAAA1", quality: 80 });
    expect(body.cost).toEqual({ free: false, creditsCharged: 1, creditsRemaining: 2, freeSearchesLeft: null });
    expect(credits(id)).toBe(2);
    expect(mem.ledger.at(-1)).toMatchObject({ userId: id, kind: "SPEND", delta: -1 });
  });

  it("gives Pro 100 free searches a cycle, then charges a credit", async () => {
    const id = user("PRO", 5);
    const first = await (await call("ceramic mug")).json();
    expect(first.cost).toEqual({ free: true, creditsCharged: 0, creditsRemaining: 5, freeSearchesLeft: 99 });
    for (let i = 0; i < 99; i++) mem.usage.push({ userId: id, free: true, createdAt: new Date() });
    const after100 = await call("ceramic mug");
    expect((await after100.json()).cost).toEqual({ free: false, creditsCharged: 1, creditsRemaining: 4, freeSearchesLeft: 0 });
    mem.users.get(id)!.platformCredits = 0;
    const out = await call("ceramic mug");
    expect([out.status, (await out.json()).message]).toEqual([402, "You've used this month's 100 free searches, and a search costs £0.50; your balance is £0.00."]);
  });

  it("returns 402 with no credits and no free searches, before searching", async () => {
    user("FREE", 0);
    const res = await call("ceramic mug");
    expect([res.status, (await res.json()).error]).toEqual([402, "insufficient_credits"]);
    expect(search).not.toHaveBeenCalled();
  });

  it("doesn't charge for a search that finds nothing or fails", async () => {
    const id = user("FREE", 2);
    search.mockResolvedValueOnce([]); // "ceramic mug" has no synonyms: one search
    const empty = await (await call("ceramic mug")).json();
    expect([empty.results, empty.cost.creditsCharged, credits(id)]).toEqual([[], 0, 2]);
    search.mockRejectedValueOnce(new SourceError("rainforest", "timed out"));
    const failed = await call("ceramic mug");
    expect([failed.status, (await failed.json()).message]).toEqual([502, "rainforest: timed out Your £0.50 was returned to your balance."]);
    expect(credits(id)).toBe(2);
    expect(mem.usage.filter((u) => u.userId === id)).toHaveLength(0);
  });

  it("needs sign-in, a real query and a live source", async () => {
    vi.mocked(getViewer).mockResolvedValueOnce(null);
    expect((await call("ceramic mug")).status).toBe(401);
    user("FREE", 5);
    expect((await call("x")).status).toBe(400);
    vi.mocked(liveRetailSource).mockReturnValueOnce({ ready: false, missing: ["retail source: RAINFOREST_API_KEY is not set"] });
    expect((await call("ceramic mug")).status).toBe(503);
  });
});
