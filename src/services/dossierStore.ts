// Delivered Dossiers, kept as they were sent, so a buyer can reopen one without new provider calls
// (and without paying again: see Sign-In-With-X in src/server/payments/x402/siwx.ts). No payment data
// here; the payment row points at the Dossier id.

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { Dossier } from "@/types/dossier";

/** The product a Dossier is about: marketplace and id, e.g. "amazon.co.uk:B0CH33F5P2". */
export const productKey = (d: Dossier) => `amazon.co.uk:${d.product.identifiers.asin ?? "unknown"}`;

export async function saveDossier(dossier: Dossier): Promise<void> {
  await db.dossierRecord.create({
    data: { id: dossier.id, productKey: productKey(dossier), body: dossier as unknown as Prisma.InputJsonValue, sample: dossier.sample },
  });
}

export async function loadDossier(id: string): Promise<Dossier | null> {
  const row = await db.dossierRecord.findUnique({ where: { id }, select: { body: true } });
  return row ? (row.body as unknown as Dossier) : null;
}
