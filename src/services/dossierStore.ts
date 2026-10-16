// Delivered Dossiers, kept as they were sent, so a buyer can reopen one without new provider calls
// (and without paying again: see Sign-In-With-X in src/server/payments/x402/siwx.ts). No payment data
// here; the payment row points at the Dossier id.

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { Dossier } from "@/types/dossier";

/** The product a Dossier is about: marketplace and id, e.g. "amazon.co.uk:B0CH33F5P2". */
export const productKey = (d: Dossier) => keyFor(d.product.identifiers.asin ?? "unknown");
const keyFor = (asin: string) => `amazon.co.uk:${asin}`;

export async function saveDossier(dossier: Dossier): Promise<void> {
  await db.dossierRecord.create({
    data: {
      id: dossier.id,
      productKey: productKey(dossier),
      body: dossier as unknown as Prisma.InputJsonValue,
      sample: dossier.sample,
      title: dossier.product.title,
      verdict: dossier.verdict.status === "shown" ? dossier.verdict.value.kind : "WITHHELD",
      confidence: dossier.verdict.confidence,
      generatedAt: new Date(dossier.generatedAt),
    },
  });
}

export async function loadDossier(id: string): Promise<Dossier | null> {
  const row = await db.dossierRecord.findUnique({ where: { id }, select: { body: true } });
  return row ? (row.body as unknown as Dossier) : null;
}

/** The ids of every Dossier delivered for a product, newest first. */
export async function dossierIdsFor(asin: string, limit = 200): Promise<string[]> {
  const rows = await db.dossierRecord.findMany({
    where: { productKey: keyFor(asin) },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    take: limit,
  });
  return rows.map((r) => r.id);
}
