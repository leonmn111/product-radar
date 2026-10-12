import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import {
  authenticate,
  forgetUnprovenPassword,
  hashPassword,
  RegisterInput,
  registerUser,
  setAccountPassword,
  SignInInput,
  verifyPassword,
} from "./password";

type Row = { id: string; email: string; name: string | null; image: string | null; passwordHash: string | null };

// A stand-in for db.user with just what the password module uses.
function fakeDb(rows: Row[] = []) {
  const user = {
    findUnique: vi.fn(async ({ where }: { where: { email: string } }) => rows.find((r) => r.email === where.email) ?? null),
    create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string } }) => {
      const row = { id: `u${rows.length + 1}`, name: null, image: null, ...data };
      rows.push(row);
      return { id: row.id };
    }),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  return { db: { user } as never, user, rows };
}

describe("password rules", () => {
  it("normalises the email and needs 8+ characters", () => {
    expect(RegisterInput.parse({ email: "  Me@Example.COM ", password: "longenough" }).email).toBe("me@example.com");
    expect(RegisterInput.safeParse({ email: "me@example.com", password: "short" }).success).toBe(false);
    expect(RegisterInput.safeParse({ email: "not-an-email", password: "longenough" }).success).toBe(false);
  });

  it("refuses passwords bcrypt would silently cut (over 72 bytes)", () => {
    expect(RegisterInput.safeParse({ email: "me@example.com", password: "a".repeat(72) }).success).toBe(true);
    expect(RegisterInput.safeParse({ email: "me@example.com", password: "a".repeat(73) }).success).toBe(false);
    expect(RegisterInput.safeParse({ email: "me@example.com", password: "é".repeat(37) }).success).toBe(false); // 74 bytes
  });

  it("hashes with bcrypt (10 rounds) and verifies", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
  });
});

describe("registerUser", () => {
  it("creates an account storing only a hash", async () => {
    const { db, rows } = fakeDb();
    const result = await registerUser(db, RegisterInput.parse({ email: "new@example.com", password: "longenough" }));
    expect(result).toEqual({ ok: true, userId: "u1" });
    expect(rows[0].passwordHash).not.toContain("longenough");
    expect(await verifyPassword("longenough", rows[0].passwordHash!)).toBe(true);
  });

  it("never adds a password to an existing account", async () => {
    const { db, user } = fakeDb([{ id: "u1", email: "old@example.com", name: null, image: null, passwordHash: null }]);
    expect(await registerUser(db, { email: "old@example.com", password: "longenough" })).toEqual({ ok: false, reason: "email_taken" });
    expect(user.create).not.toHaveBeenCalled();
  });

  it("reports a simultaneous duplicate registration as taken", async () => {
    const { db, user } = fakeDb();
    user.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }));
    expect(await registerUser(db, { email: "race@example.com", password: "longenough" })).toEqual({ ok: false, reason: "email_taken" });
  });
});

describe("authenticate", () => {
  it("signs in with the right password only", async () => {
    const hash = await hashPassword("longenough");
    const { db } = fakeDb([{ id: "u1", email: "me@example.com", name: "Me", image: null, passwordHash: hash }]);
    expect(await authenticate(db, SignInInput.parse({ email: "ME@example.com", password: "longenough" }))).toEqual({
      id: "u1",
      email: "me@example.com",
      name: "Me",
      image: null,
    });
    expect(await authenticate(db, { email: "me@example.com", password: "wrong-password" })).toBeNull();
  });

  it("rejects unknown emails and email-link-only accounts", async () => {
    const { db } = fakeDb([{ id: "u1", email: "link@example.com", name: null, image: null, passwordHash: null }]);
    expect(await authenticate(db, { email: "nobody@example.com", password: "whatever1" })).toBeNull();
    expect(await authenticate(db, { email: "link@example.com", password: "whatever1" })).toBeNull();
  });
});

describe("forgetUnprovenPassword", () => {
  it("clears a password only while the address is unverified", async () => {
    const { db, user } = fakeDb();
    const now = new Date("2026-10-12T12:00:00Z");
    await forgetUnprovenPassword(db, " Victim@Example.com ", now);
    // Clearing also stamps passwordChangedAt, which ends sessions signed in with that password.
    expect(user.updateMany).toHaveBeenCalledWith({
      where: { email: "victim@example.com", emailVerified: null, passwordHash: { not: null } },
      data: { passwordHash: null, passwordChangedAt: now },
    });
  });
});

describe("setAccountPassword (account page)", () => {
  type UserRow = { id: string; email: string; passwordHash: string | null };
  function accountDb(row: UserRow | null, updated = 1) {
    const user = {
      findUnique: vi.fn(async () => (row ? { email: row.email, passwordHash: row.passwordHash } : null)),
      updateMany: vi.fn<(args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>>(async () => ({
        count: updated,
      })),
    };
    return { db: { user } as never, user };
  }

  it("sets a first password with no current password, leaving every session signed in", async () => {
    const { db, user } = accountDb({ id: "u1", email: "link@example.com", passwordHash: null });
    expect(await setAccountPassword(db, "u1", { password: "brand new pass" })).toEqual({ ok: true, email: "link@example.com", firstPassword: true });
    const { where, data } = user.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "u1", passwordHash: null }); // only if still unset
    expect(await verifyPassword("brand new pass", data.passwordHash as string)).toBe(true);
    expect(data.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(data).not.toHaveProperty("passwordChangedAt"); // no session ends
  });

  it("needs the right current password to change one", async () => {
    const hash = await hashPassword("old password");
    const { db, user } = accountDb({ id: "u1", email: "pw@example.com", passwordHash: hash });
    expect(await setAccountPassword(db, "u1", { password: "new password" })).toEqual({ ok: false, reason: "current_password_required" });
    expect(await setAccountPassword(db, "u1", { currentPassword: "wrong one", password: "new password" })).toEqual({
      ok: false,
      reason: "wrong_current_password",
    });
    expect(user.updateMany).not.toHaveBeenCalled();
    expect(await setAccountPassword(db, "u1", { currentPassword: "old password", password: "new password" })).toEqual({
      ok: true,
      email: "pw@example.com",
      firstPassword: false,
    });
    const { where, data } = user.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "u1", passwordHash: hash }); // only if unchanged since it was checked
    expect(data).not.toHaveProperty("passwordChangedAt");
  });

  it("ends every older session only when asked to", async () => {
    const { db, user } = accountDb({ id: "u1", email: "pw@example.com", passwordHash: await hashPassword("old password") });
    const at = new Date("2026-10-12T20:00:00Z");
    await setAccountPassword(db, "u1", { currentPassword: "old password", password: "new password" }, { endSessionsAt: at });
    expect(user.updateMany.mock.calls[0][0].data.passwordChangedAt).toBe(at);
  });

  it("reports a password changed elsewhere in between, and a missing account", async () => {
    expect(await setAccountPassword(accountDb({ id: "u1", email: "a@example.com", passwordHash: null }, 0).db, "u1", { password: "new password" })).toEqual({
      ok: false,
      reason: "changed_meanwhile",
    });
    expect(await setAccountPassword(accountDb(null).db, "gone", { password: "new password" })).toEqual({ ok: false, reason: "no_account" });
  });
});
