// Checkout + customer portal sessions. Billing module only.

import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { applySubscription, snapshotFromStripe, tierForStatus } from "./subscription";
import { proPriceId, stripe } from "./stripe";

async function ensureCustomer(db: PrismaClient, userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, stripeCustomerId: true, subscriptionStatus: true },
  });
  if (user.stripeCustomerId) return user as typeof user & { stripeCustomerId: string };

  const customer = await stripe().customers.create(
    { email: user.email, metadata: { userId: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  // Only set if still empty, so two simultaneous clicks can't overwrite each other.
  await db.user.updateMany({ where: { id: user.id, stripeCustomerId: null }, data: { stripeCustomerId: customer.id } });
  const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeCustomerId: true } });
  return { ...user, stripeCustomerId: fresh.stripeCustomerId! };
}

/** Returns a URL to send the user to: Stripe Checkout, or the billing portal if they're already subscribed. */
export async function createCheckoutUrl(db: PrismaClient, userId: string, baseUrl: string): Promise<string> {
  const user = await ensureCustomer(db, userId);
  if (user.subscriptionStatus && tierForStatus(user.subscriptionStatus) === "PRO") {
    return createPortalUrl(db, userId, baseUrl);
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: user.stripeCustomerId,
    client_reference_id: user.id,
    line_items: [{ price: await proPriceId(), quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: user.id } },
    success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalUrl(db: PrismaClient, userId: string, baseUrl: string): Promise<string> {
  const user = await ensureCustomer(db, userId);
  const portal = await stripe().billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${baseUrl}/` });
  return portal.url;
}

/**
 * Called from the success page: reads the finished Checkout Session straight
 * from Stripe and applies the subscription, so Pro unlocks immediately even
 * if the webhook hasn't arrived yet (or isn't set up locally).
 */
export async function confirmCheckout(db: PrismaClient, userId: string, sessionId: string) {
  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (session.client_reference_id !== userId) return { ok: false as const, reason: "This checkout belongs to another account." };
  if (session.status !== "complete" || !session.subscription || typeof session.subscription === "string") {
    return { ok: false as const, reason: "Payment isn't complete yet." };
  }
  const snap = snapshotFromStripe(session.subscription);
  await applySubscription(db, snap, new Date());
  return { ok: true as const, tier: tierForStatus(snap.status), periodEnd: snap.currentPeriodEnd };
}
