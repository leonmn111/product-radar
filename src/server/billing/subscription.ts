// Stripe subscription state → User row. Pure mapping + one guarded write.
// Used by the webhook and by the post-checkout success page.

import type Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma/client";
import type { SubscriptionStatus, SubscriptionTier } from "@/generated/prisma/enums";

export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

const STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "UNPAID",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  paused: "PAUSED",
};

/**
 * Which plan a subscription status grants. PAST_DUE keeps Pro while Stripe
 * retries the card (Stripe then moves it to canceled/unpaid, which drops to FREE).
 */
export function tierForStatus(status: SubscriptionStatus): SubscriptionTier {
  return status === "ACTIVE" || status === "TRIALING" || status === "PAST_DUE" ? "PRO" : "FREE";
}

export function snapshotFromStripe(sub: Stripe.Subscription): SubscriptionSnapshot {
  // Newer Stripe API versions report the billing period per subscription item.
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const periodEnd = sub.items?.data?.[0]?.current_period_end ?? legacy ?? null;
  return {
    id: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    status: STATUS_MAP[sub.status],
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
}

export type ApplyResult = "applied" | "stale" | "superseded" | "unknown_customer";

/**
 * Writes the subscription onto its user. Safe to call repeatedly and out of
 * order: events older than the last one applied are ignored, and a finished
 * old subscription can't downgrade a user who has a newer active one.
 */
export async function applySubscription(
  db: PrismaClient,
  snap: SubscriptionSnapshot,
  eventTime: Date,
): Promise<ApplyResult> {
  const user = await db.user.findUnique({
    where: { stripeCustomerId: snap.customerId },
    select: { id: true, stripeSubscriptionId: true, subscriptionStatus: true, subscriptionSyncedAt: true },
  });
  if (!user) return "unknown_customer";
  if (user.subscriptionSyncedAt && user.subscriptionSyncedAt > eventTime) return "stale";

  const newTier = tierForStatus(snap.status);
  const currentGrantsPro = user.subscriptionStatus ? tierForStatus(user.subscriptionStatus) === "PRO" : false;
  if (user.stripeSubscriptionId && user.stripeSubscriptionId !== snap.id && currentGrantsPro && newTier === "FREE") {
    return "superseded";
  }

  // Conditional update closes the race between two concurrent events.
  const { count } = await db.user.updateMany({
    where: {
      id: user.id,
      OR: [{ subscriptionSyncedAt: null }, { subscriptionSyncedAt: { lte: eventTime } }],
    },
    data: {
      stripeSubscriptionId: snap.id,
      subscriptionStatus: snap.status,
      subscriptionCurrentPeriodEnd: snap.currentPeriodEnd,
      subscriptionCancelAtPeriodEnd: snap.cancelAtPeriodEnd,
      subscriptionSyncedAt: eventTime,
      subscriptionTier: newTier,
    },
  });
  return count === 1 ? "applied" : "stale";
}
