// What the account page shows about the signed-in user's own account. Never
// returns the password hash itself, only whether one is set.

import type { PrismaClient } from "@/generated/prisma/client";

export type AccountProfile = { email: string; memberSince: Date; emailVerified: boolean; hasPassword: boolean };

export async function getAccountProfile(db: Pick<PrismaClient, "user">, userId: string): Promise<AccountProfile | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, createdAt: true, emailVerified: true, passwordHash: true },
  });
  return user
    ? { email: user.email, memberSince: user.createdAt, emailVerified: user.emailVerified !== null, hasPassword: user.passwordHash !== null }
    : null;
}
