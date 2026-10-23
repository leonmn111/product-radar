// Renewed provider tokens in PostgreSQL (ProviderToken), encrypted at rest with AES-256-GCM under a
// key derived from AUTH_SECRET. A row that can't be read back (e.g. AUTH_SECRET changed) counts as
// missing, so the keeper falls back to the pair in the environment.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { AliexpressTokens, TokenStore } from "@/server/sources/aliexpress/tokens";

const VERSION = "v1";

const keyFrom = (secret: string) => Buffer.from(hkdfSync("sha256", secret, "productradar", "provider-token", 32));

/** Encrypts the token pair: "v1." + base64url(iv | tag | ciphertext). */
export function sealTokens(t: Pick<AliexpressTokens, "accessToken" | "refreshToken">, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify({ a: t.accessToken, r: t.refreshToken }), "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url")}`;
}

/** The token pair back, or null when it was sealed under another key or has been altered. */
export function openTokens(sealed: string, secret: string): Pick<AliexpressTokens, "accessToken" | "refreshToken"> | null {
  const [version, body] = sealed.split(".");
  if (version !== VERSION || !body) return null;
  try {
    const raw = Buffer.from(body, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const { a, r } = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
    return typeof a === "string" && a ? { accessToken: a, refreshToken: typeof r === "string" && r ? r : null } : null;
  } catch {
    return null;
  }
}

export function dbTokenStore(provider: string, secret = env.AUTH_SECRET): TokenStore {
  return {
    async load() {
      const row = await db.providerToken.findUnique({ where: { provider } });
      const tokens = row && openTokens(row.sealed, secret);
      return tokens ? { ...tokens, accessExpiresAt: row.accessExpiresAt, refreshExpiresAt: row.refreshExpiresAt } : null;
    },
    async save(t) {
      const data = { sealed: sealTokens(t, secret), accessExpiresAt: t.accessExpiresAt, refreshExpiresAt: t.refreshExpiresAt };
      await db.providerToken.upsert({ where: { provider }, create: { provider, ...data }, update: data });
    },
  };
}
