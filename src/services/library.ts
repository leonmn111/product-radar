// A signed-in person's Dossier library: every Dossier they paid credits for (one-off or Agency bulk)
// and kept, i.e. not refunded. Ownership is the credit ledger (each spend references the Dossier id
// it paid for); the Dossier itself is the copy delivered to them (DossierRecord). Reopening one is
// free: it's served from that copy, and no provider is called.

import type { PrismaClient } from "@/generated/prisma/client";
import { keptCreditSpends } from "@/server/billing/credits";
import type { Dossier } from "@/types/dossier";

export type LibraryEntry = {
  dossierId: string;
  asin: string;
  title: string;
  verdict: "LAUNCH" | "TEST" | "AVOID" | "WITHHELD";
  confidence: number | null;
  generatedAt: string | null; // when its evidence was read
  purchasedAt: string;
  creditsSpent: number;
  sample: boolean;
};

const asinOf = (productKey: string) => productKey.split(":").pop() ?? "";

/** The user's Dossiers, newest purchase first. Only theirs: it starts from their own ledger. */
export async function userLibrary(db: PrismaClient, userId: string, limit = 200): Promise<LibraryEntry[]> {
  const spends = await keptCreditSpends(db, userId, limit);
  if (spends.length === 0) return [];
  const records = await db.dossierRecord.findMany({
    where: { id: { in: spends.map((s) => s.reference) } },
    select: { id: true, productKey: true, title: true, verdict: true, confidence: true, generatedAt: true, sample: true },
  });
  const byId = new Map(records.map((r) => [r.id, r]));
  return spends.flatMap((s): LibraryEntry[] => {
    const r = byId.get(s.reference);
    if (!r) return []; // a spend on a search, or a bulk item still running
    return [
      {
        dossierId: r.id,
        asin: asinOf(r.productKey),
        title: r.title ?? asinOf(r.productKey),
        verdict: (r.verdict ?? "WITHHELD") as LibraryEntry["verdict"],
        confidence: r.confidence,
        generatedAt: r.generatedAt?.toISOString() ?? null,
        purchasedAt: s.at.toISOString(),
        creditsSpent: s.credits,
        sample: r.sample,
      },
    ];
  });
}

/**
 * A Dossier the user owns, to reopen for free: the given copy (by id), or their newest of a product
 * (by ASIN). Null if they don't own it.
 */
export async function ownedDossier(db: PrismaClient, userId: string, which: { id?: string; asin?: string }): Promise<Dossier | null> {
  const owned = await keptCreditSpends(db, userId);
  const ids = owned.map((s) => s.reference);
  const record = await db.dossierRecord.findFirst({
    where: {
      id: which.id ? { in: ids.filter((i) => i === which.id) } : { in: ids },
      ...(which.asin ? { productKey: `amazon.co.uk:${which.asin}` } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  return record ? (record.body as unknown as Dossier) : null;
}
