import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { ownedDossier, userLibrary } from "./library";

// The ledger and the stored Dossiers, in memory.
const ledger = [
  { userId: "alice", kind: "SPEND", delta: -4, reference: "d-old", createdAt: new Date("2026-10-01T10:00:00Z") },
  { userId: "alice", kind: "SPEND", delta: -1, reference: "search-abc", createdAt: new Date("2026-10-02T10:00:00Z") }, // a search, not a Dossier
  { userId: "alice", kind: "SPEND", delta: -4, reference: "d-refunded", createdAt: new Date("2026-10-03T10:00:00Z") },
  { userId: "alice", kind: "REFUND", delta: 4, reference: "d-refunded", createdAt: new Date("2026-10-03T10:00:05Z") },
  { userId: "alice", kind: "SPEND", delta: -1, reference: "d-new", createdAt: new Date("2026-10-05T10:00:00Z") }, // Pro price
  { userId: "bob", kind: "SPEND", delta: -4, reference: "d-bobs", createdAt: new Date("2026-10-06T10:00:00Z") },
];
const record = (id: string, asin: string, verdict: string) => ({
  id,
  productKey: `amazon.co.uk:${asin}`,
  title: `Product ${asin}`,
  verdict,
  confidence: 0.81,
  generatedAt: new Date("2026-10-01T09:00:00Z"),
  sample: false,
  createdAt: new Date(`2026-10-0${id === "d-new" ? 5 : 1}T10:00:00Z`),
  body: { id, product: { identifiers: { asin } } },
});
const records = [record("d-old", "B0MUGAAAA1", "TEST"), record("d-refunded", "B0MUGAAAA2", "AVOID"), record("d-new", "B0MUGAAAA1", "LAUNCH"), record("d-bobs", "B0BOBSAAA1", "TEST")];
const db = {
  creditLedgerEntry: {
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
      ledger.filter((e) => e.userId === where.userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    ),
  },
  dossierRecord: {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => records.filter((r) => where.id.in.includes(r.id))),
    findFirst: vi.fn(async ({ where }: { where: { id: { in: string[] }; productKey?: string } }) =>
      records
        .filter((r) => where.id.in.includes(r.id) && (!where.productKey || r.productKey === where.productKey))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    ),
  },
} as unknown as PrismaClient;

describe("userLibrary", () => {
  it("lists the Dossiers the user paid for and kept, newest purchase first, and nobody else's", async () => {
    const items = await userLibrary(db, "alice");
    expect(items.map((i) => [i.dossierId, i.asin, i.verdict, i.creditsSpent])).toEqual([
      ["d-new", "B0MUGAAAA1", "LAUNCH", 1],
      ["d-old", "B0MUGAAAA1", "TEST", 4],
    ]);
    expect(items[0]).toMatchObject({ title: "Product B0MUGAAAA1", confidence: 0.81, generatedAt: "2026-10-01T09:00:00.000Z", purchasedAt: "2026-10-05T10:00:00.000Z" });
    expect((await userLibrary(db, "bob")).map((i) => i.dossierId)).toEqual(["d-bobs"]);
    expect(await userLibrary(db, "carol")).toEqual([]);
  });
});

describe("ownedDossier (free reopening)", () => {
  it("returns the user's own copy by id, or their newest of a product", async () => {
    expect(await ownedDossier(db, "alice", { id: "d-old" })).toMatchObject({ id: "d-old" });
    expect(await ownedDossier(db, "alice", { asin: "B0MUGAAAA1" })).toMatchObject({ id: "d-new" });
  });

  it("returns nothing for someone else's Dossier, a refunded one, or a product they never bought", async () => {
    expect(await ownedDossier(db, "alice", { id: "d-bobs" })).toBeNull();
    expect(await ownedDossier(db, "alice", { id: "d-refunded" })).toBeNull();
    expect(await ownedDossier(db, "alice", { asin: "B0BOBSAAA1" })).toBeNull();
    expect(await ownedDossier(db, "bob", { asin: "B0MUGAAAA1" })).toBeNull();
  });
});
