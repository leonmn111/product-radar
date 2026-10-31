// The £29 Pre-order Check's payments: Checkout Sessions and their confirmation. Billing module only (CLAUDE.md
// Rule 2): it records who paid for which product; services/preorderReport.ts builds what they paid for.

import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PREORDER_CHECK, preorderCheckSessionParams } from "./plans";
import { markPreorderPaid, type PreorderClaims } from "./preorderPayments";
import { stripe } from "./stripe";

/** A pending Pre-order Check for this email and product, then its Stripe Checkout URL. */
export async function createPreorderCheckout(
  db: PrismaClient,
  c: { email: string; claims: PreorderClaims; productTitle: string; baseUrl: string },
): Promise<string> {
  const check = await db.preorderCheck.create({
    data: { email: c.email, asin: c.claims.asin, claims: c.claims as unknown as Prisma.InputJsonValue, amountPence: PREORDER_CHECK.pricePence },
    select: { id: true },
  });
  const session = await stripe().checkout.sessions.create(
    preorderCheckSessionParams({
      checkId: check.id,
      email: c.email,
      asin: c.claims.asin,
      productTitle: c.productTitle,
      productUrl: `https://www.amazon.co.uk/dp/${c.claims.asin}`,
      supplierPrice: c.claims.supplier.amount,
      supplierSource: c.claims.supplier.source,
      baseUrl: c.baseUrl,
    }),
    { idempotencyKey: `preorder-${check.id}` },
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  await db.preorderCheck.update({ where: { id: check.id }, data: { stripeSessionId: session.id } });
  return session.url;
}

/** From the return page: reads the session from Stripe, so the check unlocks even before the webhook arrives. */
export { markPreorderPaid };

export async function confirmPreorderCheckout(db: PrismaClient, sessionId: string, now: Date) {
  return markPreorderPaid(db, await stripe().checkout.sessions.retrieve(sessionId), now);
}
