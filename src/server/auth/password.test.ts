import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { authenticate, forgetUnprovenPassword, hashPassword, RegisterInput, registerUser, SignInInput, verifyPassword } from "./password";

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
    await forgetUnprovenPassword(db, " Victim@Example.com ");
    expect(user.updateMany).toHaveBeenCalledWith({
      where: { email: "victim@example.com", emailVerified: null, passwordHash: { not: null } },
      data: { passwordHash: null },
    });
  });
});
