import { connection } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { handleStripeEvent, InvalidSignatureError, verifyStripeEvent } from "@/server/billing/webhook";

// POST /api/billing/webhook — Stripe → us. Signature-verified; idempotent.
export async function POST(request: Request) {
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
    const handled = await handleStripeEvent(db, event);
    return Response.json({ received: true, ...handled });
  } catch (e) {
    console.error("[billing] webhook handling failed", event.type, event.id, e);
    return Response.json({ error: "handler_failed" }, { status: 500 }); // Stripe will retry
  }
}
