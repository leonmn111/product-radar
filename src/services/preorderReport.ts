// What a paid £29 Pre-order Check delivers: the full breakdown of the product the buyer checked, rebuilt from
// what the homepage check was run on (the PreorderCheck's claims) and saved on the row, so its page stays
// readable for good. Usually from the 48-hour Dossier cache; if that has expired, the Dossier is fetched again
// (the buyer has paid for it).

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { sendEmail } from "@/lib/email";
import { PreorderCheckReceipt } from "@/lib/emails/preorderCheckReceipt";
import { PREORDER_CHECK } from "@/server/billing/plans";
import type { PaidPreorder } from "@/server/billing/preorderPayments";
import { liveSources } from "@/server/live/config";
import { dbDossierCache } from "@/services/dossierCache";
import { getProductDossier } from "@/services/dossierService";
import { quickBreakdown, quickVerdict, subjectFlags } from "@/services/quickVerdict";
import type { QuickBreakdown } from "@/types/quickCheck";

export const preorderCheckPath = (stripeSessionId: string) => `/preorder-check/${stripeSessionId}`;

/** The saved breakdown, or built and saved now. Null when the evidence can no longer price the product. */
export async function preorderBreakdown(db: PrismaClient, check: PaidPreorder): Promise<QuickBreakdown | null> {
  const row = await db.preorderCheck.findUnique({ where: { id: check.id }, select: { breakdown: true } });
  if (row?.breakdown) return row.breakdown as unknown as QuickBreakdown;
  const now = new Date();
  let dossier = await dbDossierCache.get(check.asin, now);
  if (!dossier) {
    const live = liveSources();
    if (!live.ready) return null;
    dossier = (await getProductDossier(check.asin, { sources: live.sources, cache: dbDossierCache, sample: false, id: randomBytes(32).toString("hex") }))?.dossier ?? null;
  }
  if (!dossier) return null;
  const c = check.claims;
  const pasted = c.name ? { name: c.name, brand: c.brand } : null;
  const breakdown = quickBreakdown(dossier, quickVerdict(dossier, subjectFlags(dossier, pasted), c.supplier, new Date()), c.supplier, 0);
  if (!breakdown) {
    console.error("[preorder] PAID check can't be priced any more: refund or fix by hand", check.id, check.asin);
    return null;
  }
  await db.preorderCheck.update({ where: { id: check.id }, data: { breakdown: breakdown as unknown as Prisma.InputJsonValue } });
  return breakdown;
}

/** Once a check is first paid: save its report and email the buyer its link. A failure is logged, never thrown. */
export async function afterPreorderPaid(db: PrismaClient, check: PaidPreorder, baseUrl: string): Promise<void> {
  const breakdown = await preorderBreakdown(db, check).catch((e) => {
    console.error("[preorder] couldn't build the report yet (its page will try again)", check.id, e);
    return null;
  });
  await sendEmail({
    to: check.email,
    ...PreorderCheckReceipt({
      productTitle: breakdown?.product.title ?? `Amazon UK product ${check.asin}`,
      amountPence: PREORDER_CHECK.pricePence,
      paidAt: new Date(),
      reference: check.stripeSessionId,
      checkUrl: `${baseUrl}${preorderCheckPath(check.stripeSessionId)}`,
    }),
  }).catch((e) => console.error("[preorder] receipt email failed (the check is unlocked)", check.id, e));
}
