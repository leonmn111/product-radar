// The signed-in user's own billing state, for the account page. Billing module
// only: core features read the plan tier through auth/entitlements instead.

import type { PrismaClient } from "@/generated/prisma/client";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

export type BillingSummary = {
  hasBillingAccount: boolean; // a Stripe customer exists, so the billing portal has something to show
  status: SubscriptionStatus | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export async function getBillingSummary(db: Pick<PrismaClient, "user">, userId: string): Promise<BillingSummary> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      stripeCustomerId: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
      subscriptionCancelAtPeriodEnd: true,
    },
  });
  return {
    hasBillingAccount: Boolean(user?.stripeCustomerId),
    status: user?.subscriptionStatus ?? null,
    currentPeriodEnd: user?.subscriptionCurrentPeriodEnd ?? null,
    cancelAtPeriodEnd: user?.subscriptionCancelAtPeriodEnd ?? false,
  };
}
