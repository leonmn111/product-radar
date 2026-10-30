// The homepage check's unlock reference: what the email gate needs to rebuild a check's breakdown from the
// cached Dossier without calling a provider again, signed so it can't be edited (a different supplier price,
// another product). HMAC-SHA256 over the JSON, keyed with AUTH_SECRET. It holds no personal data.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { QuickSupplier } from "@/services/quickVerdict";

/** A check can be unlocked for a day; the Dossier it's rebuilt from is cached for 48 hours. */
export const UNLOCK_TTL_MS = 24 * 60 * 60 * 1000;

export type UnlockClaims = {
  asin: string; // the Amazon UK product the price comes from
  link: "amazon" | "aliexpress" | "tiktok";
  name: string | null; // the pasted product's name (AliExpress or TikTok Shop), its resale checks read it
  brand: string | null; // the brand the AliExpress listing states
  supplier: QuickSupplier;
  exp: number; // ms since epoch
};

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signUnlock(claims: Omit<UnlockClaims, "exp">, secret: string, now: Date): string {
  const body = b64(JSON.stringify({ ...claims, exp: now.getTime() + UNLOCK_TTL_MS }));
  return `${body}.${sign(body, secret)}`;
}

/** The claims, or null when the token is malformed, tampered with or expired. */
export function verifyUnlock(token: string, secret: string, now: Date): UnlockClaims | null {
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UnlockClaims;
    return typeof claims.exp === "number" && claims.exp > now.getTime() && /^[A-Z0-9]{10}$/.test(claims.asin) ? claims : null;
  } catch {
    return null;
  }
}
