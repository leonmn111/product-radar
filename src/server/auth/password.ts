// Email + password accounts. Passwords are stored only as bcrypt hashes.
//
// A password set by registering is unproven: anyone can type any address. So
// the first time the address is proven (an email sign-in link is used), a
// password set before that is dropped — see forgetUnprovenPassword(). Without
// it, someone could register a stranger's address, wait for the stranger to
// sign in by email and subscribe, then sign in with their own password.

import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { createRateLimiter } from "@/lib/rate-limit";

const SALT_ROUNDS = 10;
const MIN_LENGTH = 8;
const MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes, so longer passwords are refused, not silently cut

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address." }).max(254, { message: "That email address is too long." }));

export const newPassword = z
  .string()
  .min(MIN_LENGTH, { message: `Use at least ${MIN_LENGTH} characters.` })
  .refine((p) => Buffer.byteLength(p, "utf8") <= MAX_BYTES, { message: "Use at most 72 characters." });

export const RegisterInput = z.object({ email, password: newPassword });
export const EmailInput = email;
export const SignInInput = z.object({ email, password: z.string().min(1).max(1024) });

export const hashPassword = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Compared against when the account doesn't exist, so a wrong email takes as long as a wrong password.
// A fixed hash of a discarded random password, same cost as real ones (hashing at import time would
// use randomness while Next.js prerenders pages that import this module).
const DUMMY_HASH = "$2b$10$gKDCmuBbfUxVS.O.EuJuDupjeH6bWxqGxx19Ph10fJszFloCt5c8q";

type Db = Pick<PrismaClient, "user">;

export type RegisterResult = { ok: true; userId: string } | { ok: false; reason: "email_taken" };

export async function registerUser(db: Db, input: z.infer<typeof RegisterInput>): Promise<RegisterResult> {
  // An existing account (e.g. one that signs in by email link) never gets a password this way:
  // registering isn't proof of owning the address.
  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    return { ok: false, reason: "email_taken" };
  }
  try {
    const user = await db.user.create({
      data: { email: input.email, passwordHash: await hashPassword(input.password) },
      select: { id: true },
    });
    return { ok: true, userId: user.id };
  } catch (e) {
    // Two registrations for the same address at once: the second loses the unique check.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, reason: "email_taken" };
    throw e;
  }
}

/** The account if the email and password match, otherwise null. */
export async function authenticate(db: Db, input: z.infer<typeof SignInInput>) {
  const user = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true, image: true, passwordHash: true },
  });
  const matches = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !matches) return null;
  return { id: user.id, email: user.email, name: user.name, image: user.image };
}

/**
 * Called when an email sign-in link is used, before Auth.js marks the address
 * verified: drops a password that was set while the address was still unproven,
 * and (via passwordChangedAt) ends every session signed in with it.
 */
export async function forgetUnprovenPassword(db: Db, address: string, now = new Date()) {
  await db.user.updateMany({
    where: { email: address.trim().toLowerCase(), emailVerified: null, passwordHash: { not: null } },
    data: { passwordHash: null, passwordChangedAt: now },
  });
}

/** False when the session signed in before the account's password last changed (it has ended). */
export function sessionStillValid(signedInAt: number | undefined, passwordChangedAt: Date | null) {
  return !passwordChangedAt || (signedInAt ?? 0) >= passwordChangedAt.getTime();
}

// Brute-force guards (per server process; see lib/rate-limit.ts).
export const signInLimits = {
  perEmail: createRateLimiter({ windowMs: 15 * 60_000, max: 10 }),
  perClient: createRateLimiter({ windowMs: 15 * 60_000, max: 50 }),
};
export const registerLimits = { perClient: createRateLimiter({ windowMs: 60 * 60_000, max: 10 }) };

/** The client address from the proxy header, or null when the host doesn't send one. */
export function clientAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
