// The site-wide daily cap on free verdicts (FreeVerdictDay): what anonymous checks from the landing page
// may spend on live provider calls. Reserving is one atomic UPDATE (`used < cap`), so two visitors at the
// same moment can't both take the last slot. A check that fails, or turns out to be cached, gives its
// slot back.

import { db } from "@/lib/db";

export interface FreeVerdictQuota {
  /** Takes one of today's live checks; false when today's are all used. */
  reserve(day: Date, cap: number): Promise<boolean>;
  /** Gives a reserved check back. */
  release(day: Date): Promise<void>;
}

/** The UTC day a check counts against. */
export const utcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export const dbFreeVerdictQuota: FreeVerdictQuota = {
  async reserve(day, cap) {
    if (cap <= 0) return false;
    await db.freeVerdictDay.upsert({ where: { day }, create: { day }, update: {} });
    const { count } = await db.freeVerdictDay.updateMany({ where: { day, used: { lt: cap } }, data: { used: { increment: 1 } } });
    return count === 1;
  },
  async release(day) {
    await db.freeVerdictDay.updateMany({ where: { day, used: { gt: 0 } }, data: { used: { decrement: 1 } } });
  },
};
