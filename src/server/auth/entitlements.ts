// What a viewer is allowed to do. Core features ask THIS module, never the
// billing module — it only knows the plan tier, not how it was paid for.

import { connection } from "next/server";
import { auth } from "@/auth";
import type { SubscriptionTier } from "@/generated/prisma/enums";

export type Viewer = { id: string; email: string; tier: SubscriptionTier } | null;

export async function getViewer(): Promise<Viewer> {
  await connection(); // per-request: never prerender or cache who the viewer is
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  return { id: session.user.id, email: session.user.email, tier: session.user.tier };
}

const PAID_TIERS: SubscriptionTier[] = ["PRO", "BUSINESS"];

/** Submit new product URLs for live ingestion. */
export const canIngest = (v: Viewer) => v !== null && PAID_TIERS.includes(v.tier);

/** See live (ingested) products. Everyone else sees the seeded sample data only. */
export const canViewLiveData = (v: Viewer) => v !== null && PAID_TIERS.includes(v.tier);

/** Browse the full multi-product catalog (/dashboard and /api/products). */
export const canViewCatalog = (v: Viewer) => v !== null && PAID_TIERS.includes(v.tier);

/**
 * Open one product's dossier page. Pro sees any product; everyone else sees the
 * sample products and the live products featured on the public landing page.
 */
export const canViewDossier = (v: Viewer, product: { isSample: boolean; showcased: boolean }) =>
  product.isSample || product.showcased || canViewLiveData(v);
