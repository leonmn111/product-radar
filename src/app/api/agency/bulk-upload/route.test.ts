// POST /api/agency/bulk-upload and GET /api/agency/bulk-upload/{jobId}: the real routes, the real
// credit code and the real bulk-job service, over an in-memory stand-in for PostgreSQL that rolls a
// failed transaction back as the database does. Dossiers are built by a fake (no provider calls).

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const mem = vi.hoisted(() => ({
  users: new Map<string, { platformCredits: number; subscriptionTier: string }>(),
  ledger: [] as Row[],
  jobs: [] as Row[],
  items: [] as Row[],
  records: new Map<string, unknown>(),
  after: [] as (() => Promise<unknown> | unknown)[],
  alerts: [] as Record<string, unknown>[],
  failJobCreate: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
  after: (fn: () => unknown) => mem.after.push(fn),
}));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/server/auth/entitlements", () => ({ getViewer: vi.fn() }));
vi.mock("@/server/live/config", () => ({ liveSources: vi.fn() }));
// Each Dossier is "built" by a fake: an unknown product (B0NOTHERE…) has none.
vi.mock("./run", () => ({
  bulkDeps: () => ({
    build: async (asin: string, id: string) => {
      if (asin.startsWith("B0NOTHERE")) return null;
      const d = { id, product: { title: `Product ${asin}`, identifiers: { asin } }, verdict: { status: "shown", value: { kind: "TEST" }, confidence: 0.8 }, exports: { shopifyCsvUrl: null } };
      mem.records.set(id, d);
      return d;
    },
    onDone: async (summary: Record<string, unknown>) => void mem.alerts.push(summary),
    refund: async (userId: string, credits: number, reference: string) => {
      const u = mem.users.get(userId)!;
      u.platformCredits += credits;
      mem.ledger.push({ userId, kind: "REFUND", delta: credits, balanceAfter: u.platformCredits, reference });
    },
  }),
}));
vi.mock("@/lib/db", () => {
  let n = 0;
  const id = () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`;
  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (mem.users.has(where.id) ? { ...mem.users.get(where.id)! } : null)),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...mem.users.get(where.id)! })),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; platformCredits?: { gte: number } }; data: { platformCredits: { decrement: number } } }) => {
        const u = mem.users.get(where.id);
        if (!u || (where.platformCredits && u.platformCredits < where.platformCredits.gte)) return { count: 0 };
        u.platformCredits -= data.platformCredits.decrement;
        return { count: 1 };
      }),
    },
    creditLedgerEntry: { createMany: vi.fn(async ({ data }: { data: Row[] }) => (mem.ledger.push(...data), { count: data.length })) },
    bulkJob: {
      create: vi.fn(async ({ data }: { data: { userId: string; total: number; items: { create: Row[] } } }) => {
        if (mem.failJobCreate) throw new Error("database hiccup");
        const job = { id: id(), userId: data.userId, total: data.total, status: "PENDING", createdAt: new Date(), finishedAt: null };
        mem.jobs.push(job);
        mem.items.push(...data.items.create.map((i) => ({ ...i, id: id(), jobId: job.id, status: "PENDING", error: null })));
        return { id: job.id, status: job.status, total: job.total, createdAt: job.createdAt };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mem.jobs.find((j) => j.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
        const job = mem.jobs.find((j) => j.id === where.id && j.userId === where.userId);
        return job ? { ...job, items: mem.items.filter((i) => i.jobId === job.id).sort((a, b) => Number(a.position) - Number(b.position)) } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(mem.jobs.find((j) => j.id === where.id)!, data)),
    },
    bulkJobItem: {
      findFirst: vi.fn(async ({ where }: { where: { jobId: string; status: string } }) =>
        mem.items.filter((i) => i.jobId === where.jobId && i.status === where.status).sort((a, b) => Number(a.position) - Number(b.position))[0] ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(mem.items.find((i) => i.id === where.id)!, data)),
      count: vi.fn(async ({ where }: { where: { jobId: string; status?: string } }) => mem.items.filter((i) => i.jobId === where.jobId && (!where.status || i.status === where.status)).length),
      updateMany: vi.fn(async ({ where, data }: { where: { jobId: string; status: string }; data: Row }) => {
        const hit = mem.items.filter((i) => i.jobId === where.jobId && i.status === where.status);
        hit.forEach((i) => Object.assign(i, data));
        return { count: hit.length };
      }),
    },
    dossierRecord: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter((k) => mem.records.has(k)).map((k) => ({ id: k, body: mem.records.get(k) }))),
    },
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const snapshot = { users: new Map([...mem.users].map(([k, v]) => [k, { ...v }])), ledger: [...mem.ledger], jobs: [...mem.jobs], items: [...mem.items] };
      try {
        return await fn(db);
      } catch (e) {
        Object.assign(mem, snapshot);
        throw e;
      }
    },
  };
  return { db };
});

const { getViewer } = await import("@/server/auth/entitlements");
const { liveSources } = await import("@/server/live/config");
const { POST } = await import("./route");
const { GET } = await import("./[jobId]/route");

const SITE = "http://localhost:3457";
let n = 0;
function user(tier: string, credits: number, sessionTier = tier) {
  const id = `user_${++n}`;
  mem.users.set(id, { platformCredits: credits, subscriptionTier: tier });
  vi.mocked(getViewer).mockResolvedValue({ id, email: "agency@example.com", tier: sessionTier as "AGENCY" });
  return id;
}
const upload = (body: BodyInit, type = "text/csv") =>
  POST(new NextRequest(`${SITE}/api/agency/bulk-upload`, { method: "POST", body, headers: { origin: SITE, host: "localhost:3457", "content-type": type } }));
const status = (jobId: string) => GET(new NextRequest(`${SITE}/api/agency/bulk-upload/${jobId}`), { params: Promise.resolve({ jobId }) });
const credits = (id: string) => mem.users.get(id)!.platformCredits;
const runBackground = async () => {
  const tasks = mem.after.splice(0);
  for (const t of tasks) await t();
};

describe("POST /api/agency/bulk-upload", () => {
  beforeEach(() => {
    vi.mocked(liveSources).mockReturnValue({ ready: true, sample: false, sources: {} as never });
    mem.failJobCreate = false;
    mem.after.length = 0;
  });

  it("charges 1 credit per ASIN up front, queues them as Pending, then scores them in the background", async () => {
    const id = user("AGENCY", 10);
    const res = await upload("asin\nB0MUGAAAA1\nB0NOTHERE1\nB0BOTTLE01\nB0MUGAAAA1\n");
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({ status: "PENDING", total: 3, duplicatesIgnored: 1, creditsCharged: 3, balance: 7 });
    expect(credits(id)).toBe(7);
    const items = mem.items.filter((i) => i.jobId === body.jobId);
    expect(items.map((i) => [i.position, i.asin, i.status])).toEqual([
      [1, "B0MUGAAAA1", "PENDING"],
      [2, "B0NOTHERE1", "PENDING"],
      [3, "B0BOTTLE01", "PENDING"],
    ]);
    // One ledger line per item, referencing the Dossier id it will be stored under.
    expect(mem.ledger.filter((e) => e.userId === id).map((e) => [e.kind, e.delta, e.balanceAfter, e.reference])).toEqual(
      items.map((i, k) => ["SPEND", -1, 9 - k, i.dossierId]),
    );

    await runBackground();
    const s = await (await status(body.jobId)).json();
    expect(s).toMatchObject({ status: "DONE", total: 3, counts: { pending: 0, running: 0, done: 2, failed: 1 } });
    expect(s.items[0]).toMatchObject({ asin: "B0MUGAAAA1", status: "DONE", verdict: "TEST", title: "Product B0MUGAAAA1" });
    expect(s.items[1]).toMatchObject({ asin: "B0NOTHERE1", status: "FAILED", error: "Amazon UK has no priced product B0NOTHERE1. Its credit was returned." });
    expect(credits(id)).toBe(8); // the failed item's credit came back
    expect(mem.alerts.at(-1)).toEqual({ jobId: body.jobId, userId: id, total: 3, done: 2, failed: 1 }); // the owner is told
  });

  it("fails the whole upload, charging and queuing nothing, without enough credits", async () => {
    const id = user("AGENCY", 2);
    const res = await upload("B0MUGAAAA1\nB0BOTTLE01\nB0CUPAAAA1");
    expect([res.status, await res.json()]).toEqual([402, expect.objectContaining({ error: "insufficient_credits", needed: 3, balance: 2 })]);
    expect(credits(id)).toBe(2);
    expect(mem.ledger.some((e) => e.userId === id)).toBe(false);
    expect(mem.jobs.some((j) => j.userId === id)).toBe(false);
    expect(mem.after).toHaveLength(0);
  });

  it("rolls the credits back if the job can't be written", async () => {
    const id = user("AGENCY", 5);
    mem.failJobCreate = true;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await upload("B0MUGAAAA1\nB0BOTTLE01");
    quiet.mockRestore();
    expect([res.status, (await res.json()).message]).toEqual([500, "The upload couldn't be saved. Nothing was charged; please try again."]);
    expect(credits(id)).toBe(5);
    expect(mem.ledger.some((e) => e.userId === id)).toBe(false);
  });

  it("is for Agency only, checked in the database rather than the session", async () => {
    for (const tier of ["FREE", "PRO"]) {
      user(tier, 50);
      const res = await upload("B0MUGAAAA1");
      expect([res.status, (await res.json()).error]).toEqual([403, "agency_required"]);
    }
    user("PRO", 50, "AGENCY"); // a stale session that still says Agency
    const stale = await upload("B0MUGAAAA1");
    expect(stale.status).toBe(403);
    expect((await stale.json()).message).toContain("Agency plan (£149/month)");
    vi.mocked(getViewer).mockResolvedValueOnce(null);
    expect((await upload("B0MUGAAAA1")).status).toBe(401);
  });

  it("rejects bad files before charging: rows that aren't ASINs, over 100 ASINs, an empty file", async () => {
    const id = user("AGENCY", 500);
    const bad = await upload("asin\nB0MUGAAAA1\nnope");
    expect([bad.status, (await bad.json()).invalid]).toEqual([400, [{ row: 3, value: "nope" }]]);
    const many = Array.from({ length: 101 }, (_, i) => `B0BULK${String(i).padStart(4, "0")}`).join("\n");
    expect([(await upload(many)).status, (await upload("asin\n")).status]).toEqual([400, 400]);
    expect(credits(id)).toBe(500);
  });

  it("takes the CSV as a file upload too", async () => {
    user("AGENCY", 5);
    const form = new FormData();
    form.set("file", new File(["asin\nB0MUGAAAA1\n"], "products.csv", { type: "text/csv" }));
    const res = await POST(new NextRequest(`${SITE}/api/agency/bulk-upload`, { method: "POST", body: form, headers: { origin: SITE, host: "localhost:3457" } }));
    expect([res.status, (await res.json()).total]).toEqual([202, 1]);
  });

  it("shows a job only to its owner", async () => {
    user("AGENCY", 5);
    const { jobId } = await (await upload("B0MUGAAAA1")).json();
    user("AGENCY", 5); // someone else
    expect((await status(jobId)).status).toBe(404);
  });
});
