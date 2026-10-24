// A new account's first Standard Dossier, free: on sign-up it gets exactly the credits one Free-tier Dossier
// costs (STANDARD_DOSSIER_CREDITS.FREE), once per account, as a WELCOME ledger entry. Billing module only.
//
// What fake sign-ups could spend on providers is bounded twice: sign-ups are rate limited per address
// (server/auth/password.ts), and the grants themselves are capped site-wide per UTC day
// (WELCOME_DOSSIERS_PER_DAY, WelcomeGrantDay), which holds whatever addresses the sign-ups come from.
// The grant is one transaction: today's slot, the once-per-account WelcomeGrant row, the balance and its
// ledger entry. An account welcomed before rolls it all back, the slot included.

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export type WelcomeResult = { granted: true; credits: number; balance: number } | { granted: false; reason: "already" | "daily_cap" };

const utcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

class DailyCapReached extends Error {}

export async function grantWelcomeCredits(
  db: PrismaClient,
  userId: string,
  { credits, cap, now = new Date() }: { credits: number; cap: number; now?: Date },
): Promise<WelcomeResult> {
  if (!Number.isInteger(credits) || credits <= 0) throw new RangeError(`welcome credits must be a positive whole number, got ${credits}`);
  const day = utcDay(now);
  try {
    return await db.$transaction(async (tx) => {
      await tx.welcomeGrantDay.createMany({ data: [{ day }], skipDuplicates: true });
      const { count } = await tx.welcomeGrantDay.updateMany({ where: { day, used: { lt: cap } }, data: { used: { increment: 1 } } });
      if (count === 0) throw new DailyCapReached();
      await tx.welcomeGrant.create({ data: { userId, credits } }); // a second welcome fails here (primary key)
      await tx.user.update({ where: { id: userId }, data: { platformCredits: { increment: credits } } });
      const { platformCredits } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { platformCredits: true } });
      await tx.creditLedgerEntry.create({ data: { userId, kind: "WELCOME", delta: credits, balanceAfter: platformCredits, reference: "welcome:first-dossier" } });
      return { granted: true as const, credits, balance: platformCredits };
    });
  } catch (e) {
    if (e instanceof DailyCapReached) return { granted: false, reason: "daily_cap" };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { granted: false, reason: "already" };
    throw e;
  }
}

/**
 * True while the account still has its free first Dossier: it was welcomed, it hasn't kept a Dossier
 * bought with credits yet (a refunded spend doesn't count), and its balance still covers one at `cost`.
 */
export async function freeDossierLeft(db: PrismaClient, userId: string, cost: number): Promise<boolean> {
  const [welcome, user, entries] = await Promise.all([
    db.welcomeGrant.findUnique({ where: { userId }, select: { userId: true } }),
    db.user.findUnique({ where: { id: userId }, select: { platformCredits: true } }),
    db.creditLedgerEntry.findMany({ where: { userId, kind: { in: ["SPEND", "REFUND"] } }, select: { kind: true, reference: true } }),
  ]);
  if (!welcome || !user || user.platformCredits < cost) return false;
  const refunded = new Set(entries.filter((e) => e.kind === "REFUND").map((e) => e.reference));
  return !entries.some((e) => e.kind === "SPEND" && !refunded.has(e.reference));
}
