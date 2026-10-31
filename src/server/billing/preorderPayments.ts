// Recording a paid £29 Pre-order Check. Billing module only, and kept free of `server-only`/env imports so
// the webhook handler (webhook.ts) can use it and be tested directly.

import type { PrismaClient } from "@/generated/prisma/client";
import type { UnlockClaims } from "@/server/live/quickToken";
import { preorderPaymentFor } from "./plans";

export type PreorderClaims = Omit<UnlockClaims, "exp">;

export type PaidPreorder = { id: string; email: string; asin: string; claims: PreorderClaims; stripeSessionId: string };

/**
 * Marks a paid session's Pre-order Check paid. `first` is true only for the call that made the change, so the
 * receipt goes out once however often Stripe delivers the event (and whether the webhook or the return page
 * gets there first). Null when the session doesn't pay for one.
 */
export async function markPreorderPaid(db: PrismaClient, session: Parameters<typeof preorderPaymentFor>[0], now: Date): Promise<{ check: PaidPreorder; first: boolean } | null> {
  const found = preorderPaymentFor(session);
  if (!found.checkId) return null;
  const { count } = await db.preorderCheck.updateMany({
    where: { id: found.checkId, status: "PENDING" },
    data: { status: "PAID", paidAt: now, stripeSessionId: found.sessionId },
  });
  const row = await db.preorderCheck.findUnique({ where: { id: found.checkId }, select: { id: true, email: true, asin: true, claims: true, status: true } });
  if (!row || row.status !== "PAID") return null;
  return { check: { id: row.id, email: row.email, asin: row.asin, claims: row.claims as unknown as PreorderClaims, stripeSessionId: found.sessionId }, first: count === 1 };
}

