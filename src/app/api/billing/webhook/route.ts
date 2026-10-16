import { connection, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { CreditPurchaseReceipt } from "@/lib/emails/creditPurchaseReceipt";
import { env } from "@/lib/env";
import { createDbCreditStore } from "@/server/billing/credits";
import { CREDIT_PACKS, type CreditGrant } from "@/server/billing/plans";
import { handleStripeEvent, InvalidSignatureError, verifyStripeEvent } from "@/server/billing/webhook";

// POST /api/billing/webhook — Stripe → us. Signature-verified; idempotent. Subscriptions (Pro) and
// credit packs. Also served at /api/stripe/webhook: either address works with the same signing secret.
// A pack's first credit sends the buyer a receipt (CreditPurchaseReceipt).
async function sendReceipt(grant: CreditGrant, baseUrl: string) {
  const user = await db.user.findUnique({ where: { id: grant.userId }, select: { email: true, platformCredits: true } });
  if (!user) return;
  const pack = CREDIT_PACKS[grant.packId];
  await sendEmail({
    to: user.email,
    ...CreditPurchaseReceipt({
      packName: pack.name,
      credits: grant.credits,
      amountPence: pack.pricePence, // the session's amount, which the grant checked against the catalogue
      currency: "GBP",
      newBalance: user.platformCredits,
      purchasedAt: new Date(),
      reference: grant.sessionId,
      libraryUrl: `${baseUrl}/library`,
    }),
  });
}

export async function POST(request: NextRequest) {
  await connection();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "billing_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text(); // must be the exact bytes Stripe signed
  let event;
  try {
    event = verifyStripeEvent(rawBody, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    if (e instanceof InvalidSignatureError) return Response.json({ error: "invalid_signature" }, { status: 400 });
    throw e;
  }

  try {
    const base = appUrl(request.nextUrl.origin);
    const handled = await handleStripeEvent(db, event, createDbCreditStore(db), { onCredited: (grant) => sendReceipt(grant, base) });
    return Response.json({ received: true, ...handled });
  } catch (e) {
    console.error("[billing] webhook handling failed", event.type, event.id, e);
    return Response.json({ error: "handler_failed" }, { status: 500 }); // Stripe will retry
  }
}
