// The 48-hour Dossier cache in PostgreSQL (DossierCache): one built Dossier per product, so a repeat
// request inside two days reuses its evidence instead of paying the providers again (CLAUDE.md Rule 8).
// Freshness runs from when the evidence was read (generatedAt), not from when it was last served.

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { Dossier } from "@/types/dossier";

export const DOSSIER_CACHE_TTL_MS = 48 * 60 * 60 * 1000;
const MARKETPLACE = "amazon.co.uk";

export interface DossierCacheStore {
  /** The cached Dossier for a product while it's fresh at `now`, else null. */
  get(productId: string, now: Date): Promise<Dossier | null>;
  /** Keeps a freshly built Dossier, replacing the product's previous one. */
  put(dossier: Dossier, now: Date): Promise<void>;
}

export const dbDossierCache: DossierCacheStore = {
  async get(productId, now) {
    const row = await db.dossierCache.findUnique({
      where: { marketplace_productId: { marketplace: MARKETPLACE, productId } },
      select: { dossier: true, expiresAt: true },
    });
    return row && row.expiresAt > now ? (row.dossier as unknown as Dossier) : null;
  },

  async put(dossier, now) {
    const productId = dossier.product.identifiers.asin;
    if (!productId) return;
    const generatedAt = new Date(dossier.generatedAt);
    const expiresAt = new Date(generatedAt.getTime() + DOSSIER_CACHE_TTL_MS);
    if (expiresAt <= now) return; // already stale
    const data = { dossier: dossier as unknown as Prisma.InputJsonValue, generatedAt, expiresAt, createdAt: now };
    await db.dossierCache.upsert({
      where: { marketplace_productId: { marketplace: MARKETPLACE, productId } },
      create: { marketplace: MARKETPLACE, productId, ...data },
      update: data,
    });
  },
};
