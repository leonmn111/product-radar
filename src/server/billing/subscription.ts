// Stripe subscription state → User row. Pure mapping + one guarded write.
// Used by the webhook and by the post-checkout success page.

import type Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma/client";
import type { SubscriptionStatus, SubscriptionTier } from "@/generated/prisma/enums";
import { PLANS, type PlanId } from "./plans";

export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  plan: PlanId;
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
 * Whether a subscription status keeps its plan's access. PAST_DUE keeps it while Stripe
 * retries the card (Stripe then moves it to canceled/unpaid, which drops to FREE).
 */
export const grantsAccess = (status: SubscriptionStatus) => status === "ACTIVE" || status === "TRIALING" || status === "PAST_DUE";

/** The tier a subscription grants: its plan's (Pro or Agency) while the status keeps access, else FREE. */
export function tierForStatus(status: SubscriptionStatus, plan: PlanId = "pro"): SubscriptionTier {
  return grantsAccess(status) ? PLANS[plan].tier : "FREE";
}

/** Which plan a Stripe subscription is for: the plan our checkout tagged it with, else its price. */
function planOf(sub: Stripe.Subscription): PlanId {
  const tagged = sub.metadata?.plan;
  if (tagged === "agency" || tagged === "pro") return tagged;
  return sub.items?.data?.[0]?.price?.unit_amount === PLANS.agency.pricePence ? "agency" : "pro";
}

export function snapshotFromStripe(sub: Stripe.Subscription): SubscriptionSnapshot {
  // Newer Stripe API versions report the billing period per subscription item.
  const legacy = "current_period_end" in sub && typeof sub.current_period_end === "number" ? sub.current_period_end : undefined;
  const periodEnd = sub.items?.data?.[0]?.current_period_end ?? legacy ?? null;
  return {
    id: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    plan: planOf(sub),
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

  const newTier = tierForStatus(snap.status, snap.plan);
  const currentlyPaid = user.subscriptionStatus ? grantsAccess(user.subscriptionStatus) : false;
  if (user.stripeSubscriptionId && user.stripeSubscriptionId !== snap.id && currentlyPaid && newTier === "FREE") {
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
