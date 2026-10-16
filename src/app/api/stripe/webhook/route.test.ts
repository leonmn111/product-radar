// The Stripe webhook at /api/stripe/webhook, with real Stripe signatures (made with a test secret),
// writing credit packs through the real ledger code to an in-memory stand-in for PostgreSQL that
// rolls a failed transaction back, as the database does.
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

const SECRET = "whsec_test_secret_for_signatures";
const sent = vi.hoisted(() => [] as { to: string; subject: string; text: string }[]);
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async (e: { to: string; subject: string; text: string }) => void sent.push(e)) }));
const mem = vi.hoisted(() => ({
  users: new Map<string, { platformCredits: number; stripeCustomerId: string | null }>([
    ["user_1", { platformCredits: 0, stripeCustomerId: null }],
    ["user_2", { platformCredits: 0, stripeCustomerId: null }],
  ]),
  ledger: [] as Record<string, unknown>[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env: { STRIPE_WEBHOOK_SECRET: "whsec_test_secret_for_signatures" } }));
vi.mock("@/lib/db", async () => {
  const { Prisma } = await import("@/generated/prisma/client");
  type Where = { id: string; stripeCustomerId?: null };
  const user = {
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: { platformCredits?: { increment: number }; stripeCustomerId?: string } }) => {
      const u = mem.users.get(where.id);
      if (!u || (where.stripeCustomerId === null && u.stripeCustomerId !== null)) return { count: 0 };
      if (data.platformCredits) u.platformCredits += data.platformCredits.increment;
      if (data.stripeCustomerId) u.stripeCustomerId = data.stripeCustomerId;
      return { count: 1 };
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...mem.users.get(where.id)! })),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (mem.users.has(where.id) ? { email: `${where.id}@example.com`, ...mem.users.get(where.id)! } : null)),
  };
  const creditLedgerEntry = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (data.stripeSessionId && mem.ledger.some((e) => e.stripeSessionId === data.stripeSessionId)) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
      }
      mem.ledger.push(data);
      return data;
    }),
  };
  const db = {
    user,
    creditLedgerEntry,
    // A transaction: on any error, every change made inside it is undone.
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const users = new Map([...mem.users].map(([k, v]) => [k, { ...v }]));
      const ledger = [...mem.ledger];
      try {
        return await fn(db);
      } catch (e) {
        mem.users = users;
        mem.ledger = ledger;
        throw e;
      }
    },
  };
  return { db };
});

const { POST } = await import("./route");

let n = 0;
const completed = (session: Record<string, unknown>) =>
  JSON.stringify({ id: `evt_${++n}`, object: "event", type: "checkout.session.completed", created: 1_800_000_000, data: { object: { object: "checkout.session", ...session } } });
const send = (payload: string, secret = SECRET) =>
  POST(
    new NextRequest("http://localhost:3457/api/stripe/webhook", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret }) },
    }),
  );
const pack = (over: Record<string, unknown> = {}) => ({
  id: "cs_test_growth",
  mode: "payment",
  payment_status: "paid",
  amount_total: 2500,
  currency: "gbp",
  client_reference_id: "user_1",
  metadata: { kind: "credit_pack", pack: "growth", credits: "55", userId: "user_1" },
  ...over,
});
const balance = (id: string) => mem.users.get(id)?.platformCredits;

describe("POST /api/stripe/webhook", () => {
  it("writes a paid Growth Pack to the ledger once, however often Stripe delivers it", async () => {
    const first = await send(completed(pack()));
    expect(await first.json()).toEqual({ received: true, type: "checkout.session.completed", result: "credited" });
    const again = await send(completed(pack()));
    expect((await again.json()).result).toBe("already_credited");
    // The receipt went out once, for the first delivery only.
    expect(sent.map((e) => [e.to, e.subject])).toEqual([["user_1@example.com", "Receipt: Growth Pack, 55 credits (£25.00)"]]);
    expect(sent[0].text).toContain("55 credits");
    expect(sent[0].text).toContain("http://localhost:3457/library");
    expect(balance("user_1")).toBe(55); // the repeat's increment was rolled back with its transaction
    expect(mem.ledger).toEqual([{ userId: "user_1", kind: "PURCHASE", delta: 55, balanceAfter: 55, stripeSessionId: "cs_test_growth", reference: "growth" }]);
  });

  it("still credits the pack when the receipt can't be sent", async () => {
    const { sendEmail } = await import("@/lib/email");
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("Resend is down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await send(completed(pack({ id: "cs_test_starter", amount_total: 1000, metadata: { kind: "credit_pack", pack: "starter", userId: "user_2" }, client_reference_id: "user_2" })));
    expect([res.status, (await res.json()).result]).toEqual([200, "credited"]);
    expect(balance("user_2")).toBe(20);
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("adds up packs, with the balance after each one on its ledger line", async () => {
    await send(completed(pack({ id: "cs_test_scale", amount_total: 5000, metadata: { kind: "credit_pack", pack: "scale", userId: "user_1" } })));
    expect(balance("user_1")).toBe(175);
    expect(mem.ledger.at(-1)).toMatchObject({ delta: 120, balanceAfter: 175 });
  });

  it("credits nothing for a session whose amount doesn't match the pack", async () => {
    const res = await send(completed(pack({ id: "cs_test_cheap", amount_total: 100 })));
    expect(await res.json()).toMatchObject({ result: "ignored", reason: "amount_mismatch" });
    expect(balance("user_1")).toBe(175);
  });

  it("answers Stripe, without retrying forever, for a paid pack whose account no longer exists", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await send(completed(pack({ id: "cs_test_gone", client_reference_id: "user_deleted" })));
    expect([res.status, (await res.json()).reason]).toEqual([200, "unknown_user"]);
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("still links a subscription checkout to its customer, as before", async () => {
    const res = await send(completed({ id: "cs_test_sub", mode: "subscription", customer: "cus_1", client_reference_id: "user_2" }));
    expect((await res.json()).result).toBe("linked");
  });

  it("refuses an event that Stripe didn't sign", async () => {
    const res = await send(completed(pack({ id: "cs_forged" })), "whsec_someone_else");
    expect(res.status).toBe(400);
    expect(balance("user_1")).toBe(175);
  });
});
