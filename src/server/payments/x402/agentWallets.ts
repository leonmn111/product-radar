// Agent wallets (x402 Tier 2): an AI agent signs in with its Solana wallet, gets a one-hour session token,
// and trades it for API keys it can send on ordinary HTTP requests. Payment code only (CLAUDE.md Rule 2):
// nothing here prices, searches or scores anything. The flows run over a WalletStore so they can be tested
// without a database; prismaWalletStore is the real one.
//
//   POST /api/x402/auth/nonce      { address }             → the message to sign (a fresh nonce, 5 minutes)
//   POST /api/x402/auth/verify     { address, signature }  → { token } (a session JWT, 1 hour)
//   POST /api/x402/auth/api-keys   Bearer <session token>  → { apiKey } (shown once)
//   DELETE /api/x402/auth/api-keys Bearer <session token>, { id } → the key stops working
//   GET  /api/x402/auth/me         Bearer <session token or API key> → the wallet, its balance and keys

import type { PrismaClient } from "@/generated/prisma/client";
import {
  API_KEY_PREFIX,
  createSessionToken,
  decodeSignature,
  hashApiKey,
  newApiKey,
  newNonce,
  NONCE_TTL_MS,
  SESSION_TTL_S,
  signInMessage,
  solanaPublicKey,
  verifySessionToken,
  verifySolanaSignature,
} from "./solanaAuth";

/** Active API keys one wallet may hold at once. */
export const MAX_API_KEYS = 10;

export type WalletView = {
  address: string;
  /** USDC, exact to 6 decimals, as a string so no float ever touches it. */
  usdcBalance: string;
  verifiedAt: string | null;
  apiKeys: { id: string; prefix: string; createdAt: string; lastUsedAt: string | null }[];
};

export interface WalletStore {
  /** Gives the address a fresh nonce, creating its row the first time. */
  issueNonce(address: string, nonce: string, issuedAt: Date): Promise<void>;
  pendingNonce(address: string): Promise<{ nonce: string; issuedAt: Date } | null>;
  /** Spends the nonce: true only for the first caller to present it. Records the sign-in. */
  consumeNonce(address: string, nonce: string, now: Date): Promise<boolean>;
  /** A wallet that has signed in at least once, or null. */
  wallet(address: string): Promise<WalletView | null>;
  addKey(address: string, hash: string, prefix: string, max: number): Promise<{ id: string; createdAt: Date } | "too_many" | null>;
  revokeKey(address: string, id: string, now: Date): Promise<boolean>;
  /** The signed-in wallet an active key belongs to (marking it used), or null. */
  walletForKey(hash: string, now: Date): Promise<string | null>;
}

/** Where the sign-in message says it's for: this site. */
export type Site = { domain: string; uri: string };

type Failure = { ok: false; status: number; error: string; message: string };
const fail = (status: number, error: string, message: string): Failure => ({ ok: false, status, error, message });
const NOT_AN_ADDRESS = fail(400, "invalid_address", "address must be a Solana wallet address (base58, 32 bytes).");

export async function requestNonce(store: WalletStore, address: string, site: Site, now: Date = new Date()) {
  if (!solanaPublicKey(address)) return NOT_AN_ADDRESS;
  const nonce = newNonce();
  await store.issueNonce(address, nonce, now);
  return {
    ok: true as const,
    address,
    nonce,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + NONCE_TTL_MS).toISOString(),
    message: signInMessage({ ...site, address, nonce, issuedAt: now }),
  };
}

export async function verifySignIn(
  store: WalletStore,
  input: { address: string; signature: string },
  site: Site,
  auth: { secret: string; issuer: string },
  now: Date = new Date(),
) {
  if (!solanaPublicKey(input.address)) return NOT_AN_ADDRESS;
  const signature = decodeSignature(input.signature);
  if (!signature) return fail(400, "invalid_signature", "signature must be the 64-byte Ed25519 signature, in base58 or base64.");
  const pending = await store.pendingNonce(input.address);
  if (!pending) return fail(400, "no_nonce", "Ask for a nonce first (POST /api/x402/auth/nonce), then sign the message it returns.");
  if (now.getTime() - pending.issuedAt.getTime() > NONCE_TTL_MS) return fail(410, "nonce_expired", "That nonce has expired. Ask for a new one.");
  const message = signInMessage({ ...site, address: input.address, nonce: pending.nonce, issuedAt: pending.issuedAt });
  if (!verifySolanaSignature(input.address, message, signature)) {
    return fail(401, "bad_signature", "The signature doesn't match this wallet and the message from /api/x402/auth/nonce.");
  }
  if (!(await store.consumeNonce(input.address, pending.nonce, now))) return fail(409, "nonce_used", "That nonce was already used. Ask for a new one.");
  return {
    ok: true as const,
    tokenType: "Bearer" as const,
    token: await createSessionToken(input.address, auth.secret, auth.issuer, now),
    expiresIn: SESSION_TTL_S,
    address: input.address,
  };
}

/** Who's calling: a session token or an API key in `Authorization: Bearer …`, for a wallet that has signed in. */
export async function authenticateAgent(
  store: WalletStore,
  authorization: string | null,
  auth: { secret: string; issuer: string },
  now: Date = new Date(),
): Promise<{ address: string; via: "session" | "api_key" } | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? "")?.[1];
  if (!token) return null;
  if (token.startsWith(API_KEY_PREFIX)) {
    const address = await store.walletForKey(hashApiKey(token), now);
    return address ? { address, via: "api_key" } : null;
  }
  const address = await verifySessionToken(token, auth.secret, auth.issuer, now);
  return address && (await store.wallet(address)) ? { address, via: "session" } : null;
}

export async function issueApiKey(store: WalletStore, address: string) {
  const k = newApiKey();
  const added = await store.addKey(address, k.hash, k.prefix, MAX_API_KEYS);
  if (added === null) return fail(404, "unknown_wallet", "Sign in with this wallet first.");
  if (added === "too_many") return fail(409, "too_many_keys", `A wallet can hold ${MAX_API_KEYS} active API keys. Revoke one first.`);
  return { ok: true as const, apiKey: k.key, id: added.id, prefix: k.prefix, createdAt: added.createdAt.toISOString() };
}

export function prismaWalletStore(db: PrismaClient): WalletStore {
  return {
    async issueNonce(address, nonce, issuedAt) {
      await db.wallet.upsert({ where: { address }, create: { address, nonce, nonceIssuedAt: issuedAt }, update: { nonce, nonceIssuedAt: issuedAt } });
    },
    async pendingNonce(address) {
      const w = await db.wallet.findUnique({ where: { address }, select: { nonce: true, nonceIssuedAt: true } });
      return w?.nonce && w.nonceIssuedAt ? { nonce: w.nonce, issuedAt: w.nonceIssuedAt } : null;
    },
    async consumeNonce(address, nonce, now) {
      // One statement: of two requests racing with the same signature, only one clears the nonce.
      const { count } = await db.wallet.updateMany({ where: { address, nonce }, data: { nonce: null, nonceIssuedAt: null, lastSignInAt: now } });
      if (count === 1) await db.wallet.updateMany({ where: { address, verifiedAt: null }, data: { verifiedAt: now } });
      return count === 1;
    },
    async wallet(address) {
      const w = await db.wallet.findUnique({
        where: { address },
        select: { address: true, usdcBalance: true, verifiedAt: true, apiKeys: { where: { revokedAt: null }, orderBy: { createdAt: "asc" } } },
      });
      if (!w?.verifiedAt) return null;
      return {
        address: w.address,
        usdcBalance: w.usdcBalance.toFixed(6),
        verifiedAt: w.verifiedAt.toISOString(),
        apiKeys: w.apiKeys.map((k) => ({ id: k.id, prefix: k.prefix, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null })),
      };
    },
    async addKey(address, keyHash, prefix, max) {
      return db.$transaction(async (tx) => {
        const w = await tx.wallet.findUnique({ where: { address }, select: { id: true, verifiedAt: true } });
        if (!w?.verifiedAt) return null;
        // Lock the wallet's row so two requests can't both slip under the limit.
        await tx.$executeRaw`SELECT 1 FROM "Wallet" WHERE id = ${w.id}::uuid FOR UPDATE`;
        if ((await tx.agentApiKey.count({ where: { walletId: w.id, revokedAt: null } })) >= max) return "too_many" as const;
        return tx.agentApiKey.create({ data: { walletId: w.id, keyHash, prefix }, select: { id: true, createdAt: true } });
      });
    },
    async revokeKey(address, id, now) {
      const { count } = await db.agentApiKey.updateMany({ where: { id, revokedAt: null, wallet: { address } }, data: { revokedAt: now } });
      return count === 1;
    },
    async walletForKey(keyHash, now) {
      const k = await db.agentApiKey.findUnique({ where: { keyHash }, select: { id: true, revokedAt: true, wallet: { select: { address: true, verifiedAt: true } } } });
      if (!k || k.revokedAt || !k.wallet.verifiedAt) return null;
      await db.agentApiKey.update({ where: { id: k.id }, data: { lastUsedAt: now } });
      return k.wallet.address;
    },
  };
}
