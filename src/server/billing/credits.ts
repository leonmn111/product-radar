// Platform credits bought with fiat (1 credit = £0.50). Billing module only.
//
// The balance is User.platformCredits; every change to it writes a CreditLedgerEntry in the same
// database transaction, so the two always agree. A Stripe purchase is credited once (the ledger's
// stripeSessionId is unique), a spend never takes a balance below zero (a conditional update, with a
// CHECK constraint behind it), and a failed request's spend is refunded.

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { CreditGrant } from "./plans";

export class InsufficientCreditsError extends Error {
  constructor(
    readonly needed: number,
    readonly balance: number,
  ) {
    super(`Needs ${needed} credits; the balance is ${balance}.`);
    this.name = "InsufficientCreditsError";
  }
}

export interface CreditStore {
  /** Adds a paid pack's credits. Idempotent per Stripe session: false if it was already credited. */
  grant(grant: CreditGrant): Promise<boolean>;
  /** Takes `credits` for `reference` (e.g. a Dossier id); the balance after. Throws InsufficientCreditsError. */
  spend(userId: string, credits: number, reference: string): Promise<number>;
  /** Gives back a spend whose request failed; the balance after. */
  refund(userId: string, credits: number, reference: string): Promise<number>;
  balance(userId: string): Promise<number>;
}

/** No user with this id: credits can't be added to an account that doesn't exist. */
export class UnknownUserError extends Error {
  constructor(readonly userId: string) {
    super(`No user ${userId}.`);
    this.name = "UnknownUserError";
  }
}

const positive = (n: number) => {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError(`credits must be a positive whole number, got ${n}`);
  return n;
};

export function createDbCreditStore(db: PrismaClient): CreditStore {
  async function add(userId: string, credits: number, entry: { kind: "PURCHASE" | "REFUND"; stripeSessionId?: string; reference?: string }) {
    return db.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({ where: { id: userId }, data: { platformCredits: { increment: positive(credits) } } });
      if (count === 0) throw new UnknownUserError(userId);
      const { platformCredits } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { platformCredits: true } });
      await tx.creditLedgerEntry.create({ data: { userId, delta: credits, balanceAfter: platformCredits, ...entry } });
      return platformCredits;
    });
  }

  return {
    async grant(g) {
      try {
        await add(g.userId, g.credits, { kind: "PURCHASE", stripeSessionId: g.sessionId, reference: g.packId });
        return true;
      } catch (e) {
        // The session was credited before: the whole transaction (balance included) rolled back.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
        throw e;
      }
    },

    async spend(userId, credits, reference) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.user.updateMany({
          where: { id: userId, platformCredits: { gte: positive(credits) } },
          data: { platformCredits: { decrement: credits } },
        });
        const { platformCredits } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { platformCredits: true } });
        if (count === 0) throw new InsufficientCreditsError(credits, platformCredits);
        await tx.creditLedgerEntry.create({ data: { userId, kind: "SPEND", delta: -credits, balanceAfter: platformCredits, reference } });
        return platformCredits;
      });
    },

    refund(userId, credits, reference) {
      return add(userId, credits, { kind: "REFUND", reference });
    },

    async balance(userId) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { platformCredits: true } });
      return user?.platformCredits ?? 0;
    },
  };
}

/**
 * Which of `references` (e.g. Dossier ids) the user paid for in credits and wasn't refunded for,
 * in the order given.
 */
export async function paidCreditReferences(db: PrismaClient, userId: string, references: string[]): Promise<string[]> {
  if (references.length === 0) return [];
  const rows = await db.creditLedgerEntry.findMany({
    where: { userId, reference: { in: references }, kind: { in: ["SPEND", "REFUND"] } },
    select: { reference: true, kind: true },
  });
  const spent = new Set(rows.filter((r) => r.kind === "SPEND").map((r) => r.reference));
  const refunded = new Set(rows.filter((r) => r.kind === "REFUND").map((r) => r.reference));
  return references.filter((r) => spent.has(r) && !refunded.has(r));
}
