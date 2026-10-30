import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { dbLeadStore, FREE_BREAKDOWNS_PER_LEAD } from "./leads";

// An in-memory stand-in for the two tables, with the transaction the store runs in.
function fakeDb() {
  const leads: { id: string; email: string; marketingConsent: boolean; consentAt: Date | null }[] = [];
  const unlocks: { leadId: string; productKey: string }[] = [];
  const tx = {
    lead: {
      upsert: async ({ where, create, update }: { where: { email: string }; create: (typeof leads)[number]; update: Partial<(typeof leads)[number]> }) => {
        let lead = leads.find((l) => l.email === where.email);
        if (!lead) leads.push((lead = { ...create, id: `lead-${leads.length + 1}` }));
        else Object.assign(lead, update);
        return { id: lead.id };
      },
    },
    leadUnlock: {
      findMany: async ({ where }: { where: { leadId: string } }) => unlocks.filter((u) => u.leadId === where.leadId),
      create: async ({ data }: { data: { leadId: string; productKey: string } }) => unlocks.push(data),
    },
  };
  const db = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;
  return { db, leads, unlocks };
}

const now = new Date("2026-10-30T12:00:00.000Z");

describe("lead store", () => {
  it(`gives an email ${FREE_BREAKDOWNS_PER_LEAD} free products, counts a repeat once, then says the free ones are used`, async () => {
    const { db, unlocks } = fakeDb();
    const store = dbLeadStore(db);
    expect(await store.unlock("me@shop.test", "amazon.co.uk:A", false, now)).toEqual({ ok: true, freeLeft: 2 });
    expect(await store.unlock("me@shop.test", "amazon.co.uk:A", false, now)).toEqual({ ok: true, freeLeft: 2 }); // the same product again
    expect(await store.unlock("me@shop.test", "amazon.co.uk:B", false, now)).toEqual({ ok: true, freeLeft: 1 });
    expect(await store.unlock("me@shop.test", "amazon.co.uk:C", false, now)).toEqual({ ok: true, freeLeft: 0 });
    expect(await store.unlock("me@shop.test", "amazon.co.uk:D", false, now)).toEqual({ ok: false, reason: "limit_reached" });
    expect(await store.unlock("me@shop.test", "amazon.co.uk:B", false, now)).toEqual({ ok: true, freeLeft: 0 }); // one they already have
    expect(unlocks).toHaveLength(3);
  });

  it("records marketing consent only when it's given, with the time, and never takes it back on an unticked box", async () => {
    const { db, leads } = fakeDb();
    const store = dbLeadStore(db);
    await store.unlock("me@shop.test", "amazon.co.uk:A", false, now);
    expect(leads[0]).toMatchObject({ marketingConsent: false, consentAt: null });
    await store.unlock("me@shop.test", "amazon.co.uk:A", true, now);
    expect(leads[0]).toMatchObject({ marketingConsent: true, consentAt: now });
    await store.unlock("me@shop.test", "amazon.co.uk:B", false, new Date());
    expect(leads[0]).toMatchObject({ marketingConsent: true, consentAt: now });
  });
});
