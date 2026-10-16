// Checkout + customer portal sessions. Billing module only.

import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { checkoutSessionParams, type CheckoutTier } from "./plans";
import { applySubscription, grantsAccess, snapshotFromStripe, tierForStatus } from "./subscription";
import { stripe } from "./stripe";

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

/** Pro checkout (£29/month, plans.ts), or the billing portal if they're already subscribed. */
export async function createCheckoutUrl(db: PrismaClient, userId: string, baseUrl: string): Promise<string> {
  return createPlanCheckoutUrl(db, userId, baseUrl, "pro");
}

/**
 * Stripe Checkout for a credit pack or a subscription (plans.ts). Someone already subscribed who
 * picks a subscription gets the billing portal instead, so no one is subscribed twice.
 */
export async function createPlanCheckoutUrl(db: PrismaClient, userId: string, baseUrl: string, tier: CheckoutTier): Promise<string> {
  const user = await ensureCustomer(db, userId);
  if ((tier === "pro" || tier === "agency") && user.subscriptionStatus && grantsAccess(user.subscriptionStatus)) {
    return createPortalUrl(db, userId, baseUrl);
  }
  const session = await stripe().checkout.sessions.create(checkoutSessionParams(tier, { userId: user.id, customerId: user.stripeCustomerId, baseUrl }));
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

/** Stripe's customer portal (card, invoices, cancel), returning to the account page afterwards. */
async function portalSession(customer: string, baseUrl: string) {
  const portal = await stripe().billingPortal.sessions.create({ customer, return_url: `${baseUrl}/account` });
  return portal.url;
}

export async function createPortalUrl(db: PrismaClient, userId: string, baseUrl: string): Promise<string> {
  const user = await ensureCustomer(db, userId);
  return portalSession(user.stripeCustomerId, baseUrl);
}

/** The portal for someone who already has a Stripe customer (has checked out before), or null. Never creates one. */
export async function existingCustomerPortalUrl(db: PrismaClient, userId: string, baseUrl: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
  return user?.stripeCustomerId ? portalSession(user.stripeCustomerId, baseUrl) : null;
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
  return { ok: true as const, tier: tierForStatus(snap.status, snap.plan), periodEnd: snap.currentPeriodEnd };
}
