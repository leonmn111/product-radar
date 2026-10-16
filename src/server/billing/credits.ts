// Platform credits bought with fiat. Billing module only.
//
// MOCK: there is no credit ledger in the database yet, so grants are only held in this process's
// memory and are lost on restart. That's why the credit-pack checkout refuses to sell in production
// (src/app/api/stripe/checkout/route.ts): no one can pay for credits this store would lose. The
// next slice replaces mockCreditStore with a database ledger (one row per Stripe session, unique on
// sessionId) behind the same interface.

import type { CreditGrant } from "./plans";

export interface CreditStore {
  /** Adds the grant's credits to the user. Idempotent per Stripe session: false if already granted. */
  grant(grant: CreditGrant): Promise<boolean>;
  /** The user's credit balance. */
  balance(userId: string): Promise<number>;
}

export function createMockCreditStore(): CreditStore & { readonly kind: "mock" } {
  const bySession = new Map<string, CreditGrant>();
  return {
    kind: "mock",
    async grant(g) {
      if (bySession.has(g.sessionId)) return false;
      bySession.set(g.sessionId, g);
      return true;
    },
    async balance(userId) {
      let total = 0;
      for (const g of bySession.values()) if (g.userId === userId) total += g.credits;
      return total;
    },
  };
}

/** The store the webhook uses. A mock until the credit ledger exists (see the note above). */
export const creditStore = createMockCreditStore();
