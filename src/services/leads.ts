// Leads from the homepage check's email gate (Lead, LeadUnlock): an email unlocks the full breakdown of a
// check, free for its first FREE_BREAKDOWNS_PER_LEAD products. Unlocking a product again is free and
// doesn't count twice, and nor does a product the email bought a £29 Pre-order Check for (PreorderCheck,
// PAID): that one stays unlocked for good. Marketing consent is only ever recorded as given.

import type { PrismaClient } from "@/generated/prisma/client";

export const FREE_BREAKDOWNS_PER_LEAD = 3;

export type UnlockOutcome = { ok: true; freeLeft: number } | { ok: false; reason: "limit_reached" };

export interface LeadStore {
  /** Records the email (and consent, when given) and the product; refuses a new product past the free limit. */
  unlock(email: string, productKey: string, marketingConsent: boolean, now: Date): Promise<UnlockOutcome>;
}

export function dbLeadStore(db: PrismaClient): LeadStore {
  return {
    async unlock(email, productKey, marketingConsent, now) {
      return db.$transaction(async (tx) => {
        const lead = await tx.lead.upsert({
          where: { email },
          create: { email, marketingConsent, consentAt: marketingConsent ? now : null },
          update: marketingConsent ? { marketingConsent: true, consentAt: now } : {},
          select: { id: true },
        });
        const unlocked = await tx.leadUnlock.findMany({ where: { leadId: lead.id }, select: { productKey: true } });
        const keys = new Set(unlocked.map((u) => u.productKey));
        if (!keys.has(productKey)) {
          if (keys.size >= FREE_BREAKDOWNS_PER_LEAD) {
            const asin = productKey.slice(productKey.indexOf(":") + 1);
            const bought = await tx.preorderCheck.findFirst({ where: { email, asin, status: "PAID" }, select: { id: true } });
            return bought ? ({ ok: true, freeLeft: 0 } as const) : ({ ok: false, reason: "limit_reached" } as const);
          }
          await tx.leadUnlock.create({ data: { leadId: lead.id, productKey } });
          keys.add(productKey);
        }
        return { ok: true, freeLeft: Math.max(0, FREE_BREAKDOWNS_PER_LEAD - keys.size) } as const;
      });
    },
  };
}
