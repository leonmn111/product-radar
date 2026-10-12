// "Forgot password": a one-time link by email. Clicking it proves the address,
// so it also lets email-link-only accounts set a password for the first time.
//
// Only a SHA-256 hash of each link's random token is stored. A link works once
// and for an hour; using one marks the address verified, ends every other
// session (passwordChangedAt) and voids the account's other unused links.

import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Email } from "@/lib/email";
import { createRateLimiter } from "@/lib/rate-limit";
import { hashPassword } from "./password";

export const RESET_LINK_TTL_MS = 60 * 60_000;

type Db = Pick<PrismaClient, "user" | "passwordResetToken" | "$transaction">;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function resetEmail(to: string, link: string, hasPassword: boolean): Email {
  const action = hasPassword ? "reset the password" : "set a password";
  const subject = hasPassword ? "Reset your ProductRadar password" : "Set a password for ProductRadar";
  const text =
    `Someone (hopefully you) asked to ${action} for ${to} on ProductRadar.\n\n` +
    `Choose a new password: ${link}\n\n` +
    `The link works once and expires in 1 hour. If you didn't ask for this, ignore this email: nothing will change.`;
  const html =
    `<p>Someone (hopefully you) asked to ${action} for <strong>${escapeHtml(to)}</strong> on ProductRadar.</p>` +
    `<p><a href="${escapeHtml(link)}">Choose a new password</a></p>` +
    `<p>The link works once and expires in 1 hour. If you didn't ask for this, ignore this email: nothing will change.</p>`;
  return { to, subject, text, html };
}

/**
 * Emails a reset link when the address has an account; does nothing otherwise.
 * Callers show the same message either way, so the form can't be used to find accounts.
 */
export async function requestPasswordReset(
  db: Db,
  email: string,
  { baseUrl, send, now = new Date() }: { baseUrl: string; send: (e: Email) => Promise<void>; now?: Date },
) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, passwordHash: true } });
  if (!user) return;
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_LINK_TTL_MS) },
  });
  await send(resetEmail(user.email, `${baseUrl}/signin/reset?token=${token}`, user.passwordHash !== null));
}

/** The account's email if the link can still be used, else null (for showing the form or an "expired" message). */
export async function resetLinkEmail(db: Db, token: string, now = new Date()) {
  if (!token) return null;
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, usedAt: true, user: { select: { email: true } } },
  });
  return row && !row.usedAt && row.expiresAt > now ? row.user.email : null;
}

export type ResetResult = { ok: true; email: string } | { ok: false };

/** Sets the new password if the link is valid and unused. */
export async function resetPassword(db: Db, token: string, newPassword: string, now = new Date()): Promise<ResetResult> {
  if (!token) return { ok: false };
  const passwordHash = await hashPassword(newPassword); // outside the transaction: bcrypt is deliberately slow
  return db.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { email: true, emailVerified: true } } },
    });
    if (!row || row.usedAt || row.expiresAt <= now) return { ok: false };
    // Claim the link; a second request racing with the same link loses here.
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) return { ok: false };
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, passwordChangedAt: now, emailVerified: row.user.emailVerified ?? now },
    });
    await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } });
    return { ok: true, email: row.user.email };
  });
}

// Stops the form being used to flood an inbox (or burn the email quota).
export const resetLimits = {
  perEmail: createRateLimiter({ windowMs: 15 * 60_000, max: 3 }),
  perClient: createRateLimiter({ windowMs: 15 * 60_000, max: 10 }),
};
