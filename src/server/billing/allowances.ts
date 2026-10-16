// Plan allowances that are counted, not bought (billing module only). Today: Pro's 100 free searches
// in each billing cycle. A cycle runs from one month before the subscription's current period end;
// without a period end on record, the calendar month (UTC).

import type { PrismaClient } from "@/generated/prisma/client";
import { PLANS } from "./plans";

export const PRO_FREE_SEARCHES = PLANS.pro.monthly.freeSearches ?? 0;

/** When the billing cycle containing `now` began. */
export function billingCycleStart(periodEnd: Date | null, now: Date): Date {
  if (periodEnd && periodEnd > now) {
    const start = new Date(periodEnd);
    start.setUTCMonth(start.getUTCMonth() - 1);
    if (start <= now) return start;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Free searches a user has left this cycle: Pro only (everyone else has none). */
export async function freeSearchesLeft(db: PrismaClient, userId: string, now: Date = new Date()): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { subscriptionTier: true, subscriptionCurrentPeriodEnd: true } });
  if (user?.subscriptionTier !== "PRO") return 0;
  const used = await db.searchUsage.count({ where: { userId, free: true, createdAt: { gte: billingCycleStart(user.subscriptionCurrentPeriodEnd, now) } } });
  return Math.max(0, PRO_FREE_SEARCHES - used);
}

/** Counts one search: `free` when it used a Pro free search. */
export async function recordSearch(db: PrismaClient, userId: string, free: boolean): Promise<void> {
  await db.searchUsage.create({ data: { userId, free } });
}
