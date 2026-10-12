import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";
import type { Email } from "@/lib/email";
import { sessionStillValid, verifyPassword } from "./password";
import { RESET_LINK_TTL_MS, requestPasswordReset, resetEmail, resetLinkEmail, resetPassword } from "./password-reset";

type User = { id: string; email: string; passwordHash: string | null; passwordChangedAt: Date | null; emailVerified: Date | null };
type Token = { id: string; userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null };

// In-memory stand-in for the two tables, with just the calls the module makes.
function fakeDb(users: User[]) {
  const tokens: Token[] = [];
  const userById = (id: string) => users.find((u) => u.id === id)!;
  const withUser = (t: Token) => ({ ...t, user: userById(t.userId) });
  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => users.find((u) => u.email === where.email) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<User> }) => Object.assign(userById(where.id), data)),
    },
    passwordResetToken: {
      create: vi.fn(async ({ data }: { data: Omit<Token, "id" | "usedAt"> }) => {
        const t = { id: `t${tokens.length + 1}`, usedAt: null, ...data };
        tokens.push(t);
        return t;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const t = tokens.find((x) => x.tokenHash === where.tokenHash);
        return t ? withUser(t) : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string; userId?: string; usedAt: null }; data: { usedAt: Date } }) => {
        const hit = tokens.filter((t) => t.usedAt === null && (!where.id || t.id === where.id) && (!where.userId || t.userId === where.userId));
        for (const t of hit) t.usedAt = data.usedAt;
        return { count: hit.length };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { db: db as never, raw: db, tokens };
}

const NOW = new Date("2026-10-12T12:00:00Z");
const user = (over: Partial<User> = {}): User => ({
  id: "u1",
  email: "me@example.com",
  passwordHash: "$2b$10$existing",
  passwordChangedAt: null,
  emailVerified: null,
  ...over,
});

async function requestLink(db: never, email = "me@example.com") {
  const sent: Email[] = [];
  await requestPasswordReset(db, email, { baseUrl: "https://theproductradar.io", now: NOW, send: async (e) => void sent.push(e) });
  const token = sent[0]?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
  return { sent, token };
}

describe("requestPasswordReset", () => {
  it("emails a one-hour link and stores only a hash of its token", async () => {
    const { db, tokens } = fakeDb([user()]);
    const { sent, token } = await requestLink(db);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("me@example.com");
    expect(sent[0].text).toContain("https://theproductradar.io/signin/reset?token=");
    expect(token!.length).toBeGreaterThanOrEqual(43); // 32 random bytes
    expect(tokens[0].tokenHash).toBe(createHash("sha256").update(token!).digest("hex"));
    expect(JSON.stringify(tokens)).not.toContain(token);
    expect(tokens[0].expiresAt.getTime() - NOW.getTime()).toBe(RESET_LINK_TTL_MS);
  });

  it("sends nothing for an address without an account", async () => {
    const { db, raw } = fakeDb([user()]);
    const { sent } = await requestLink(db, "nobody@example.com");
    expect(sent).toHaveLength(0);
    expect(raw.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("words the email as 'set a password' for email-link-only accounts", async () => {
    const { db } = fakeDb([user({ passwordHash: null })]);
    const { sent } = await requestLink(db);
    expect(sent[0].subject).toBe("Set a password for ProductRadar");
  });
});

describe("resetPassword", () => {
  it("sets the password, verifies the address, ends other sessions and voids the link", async () => {
    const u = user();
    const { db, tokens } = fakeDb([u]);
    const { token } = await requestLink(db);
    const second = await requestLink(db); // an older, unused link
    expect(await resetLinkEmail(db, token!, NOW)).toBe("me@example.com");

    expect(await resetPassword(db, token!, "brand-new-pass", NOW)).toEqual({ ok: true, email: "me@example.com" });
    expect(await verifyPassword("brand-new-pass", u.passwordHash!)).toBe(true);
    expect(u.passwordChangedAt).toEqual(NOW);
    expect(u.emailVerified).toEqual(NOW);
    expect(tokens.every((t) => t.usedAt !== null)).toBe(true);

    expect(await resetPassword(db, token!, "another-pass1", NOW)).toEqual({ ok: false }); // used
    expect(await resetPassword(db, second.token!, "another-pass1", NOW)).toEqual({ ok: false }); // voided
    expect(await resetLinkEmail(db, token!, NOW)).toBeNull();
  });

  it("refuses an expired or unknown link", async () => {
    const { db } = fakeDb([user()]);
    const { token } = await requestLink(db);
    const later = new Date(NOW.getTime() + RESET_LINK_TTL_MS + 1);
    expect(await resetLinkEmail(db, token!, later)).toBeNull();
    expect(await resetPassword(db, token!, "brand-new-pass", later)).toEqual({ ok: false });
    expect(await resetPassword(db, "not-a-token", "brand-new-pass", NOW)).toEqual({ ok: false });
    expect(await resetPassword(db, "", "brand-new-pass", NOW)).toEqual({ ok: false });
  });

  it("keeps an address's existing verification date", async () => {
    const verified = new Date("2026-01-01T00:00:00Z");
    const u = user({ emailVerified: verified });
    const { db } = fakeDb([u]);
    const { token } = await requestLink(db);
    await resetPassword(db, token!, "brand-new-pass", NOW);
    expect(u.emailVerified).toEqual(verified);
  });
});

describe("resetEmail", () => {
  it("escapes the address in the HTML version", () => {
    expect(resetEmail("<b>x</b>@example.com", "https://x.test/r?token=a", true).html).toContain("&lt;b&gt;x&lt;/b&gt;@example.com");
  });
});

describe("sessionStillValid", () => {
  const changed = new Date("2026-10-12T12:00:00Z");
  it("ends sessions that signed in before the password changed", () => {
    expect(sessionStillValid(changed.getTime() - 1, changed)).toBe(false);
    expect(sessionStillValid(undefined, changed)).toBe(false); // sessions from before sign-in times were recorded
    expect(sessionStillValid(changed.getTime(), changed)).toBe(true);
    expect(sessionStillValid(undefined, null)).toBe(true);
  });
});

describe("rate limiter reset", () => {
  it("forgets a key's hits", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    limiter.limited("k", 0);
    expect(limiter.limited("k", 1)).toBe(true);
    limiter.reset("k");
    expect(limiter.limited("k", 2)).toBe(false);
  });
});
