// Sign-In With Solana for AI agents (x402 Tier 2): the pieces with no database. Payment code only (CLAUDE.md
// Rule 2).
//
//   message    the CAIP-122 / Sign-In With Solana text the wallet signs, rebuilt by the server from the
//              nonce it issued, so a client can't slip in a message of its own
//   signature  Ed25519 over the message's UTF-8 bytes, checked with Node's own crypto against the address
//              (a Solana address is the base58 of its 32-byte Ed25519 public key)
//   session    a one-hour HS256 JWT naming the wallet, signed with a key derived from AUTH_SECRET for this
//              purpose only
//   API key    "pr_agent_" + 32 random bytes in base58; only its SHA-256 is stored

import { createHash, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";
import bs58 from "bs58";
import { jwtVerify, SignJWT } from "jose";

/** How long a nonce may wait to be signed. */
export const NONCE_TTL_MS = 5 * 60_000;
/** How long a session token lasts. */
export const SESSION_TTL_S = 60 * 60;
export const API_KEY_PREFIX = "pr_agent_";
const AUDIENCE = "productradar-agent-api";
const STATEMENT = "Sign in to the ProductRadar agent API. Signing costs nothing and moves no funds.";

/** The 32-byte public key behind a Solana address, or null when it isn't one. */
export function solanaPublicKey(address: string): Uint8Array | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return null;
  try {
    const bytes = bs58.decode(address);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

export const newNonce = () => randomBytes(16).toString("hex");

export type SignInFields = { domain: string; uri: string; address: string; nonce: string; issuedAt: Date };

/** The exact text the wallet signs (the Sign-In With Solana layout Phantom and other wallets display). */
export function signInMessage({ domain, uri, address, nonce, issuedAt }: SignInFields): string {
  return [
    `${domain} wants you to sign in with your Solana account:`,
    address,
    "",
    STATEMENT,
    "",
    `URI: ${uri}`,
    "Version: 1",
    "Chain ID: mainnet",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${new Date(issuedAt.getTime() + NONCE_TTL_MS).toISOString()}`,
  ].join("\n");
}

/** A 64-byte signature sent as base58 (Solana's usual form) or base64; null when it's neither. */
export function decodeSignature(s: string): Uint8Array | null {
  const t = s.trim();
  try {
    const b58 = bs58.decode(t);
    if (b58.length === 64) return b58;
  } catch {
    // not base58: try base64
  }
  const b64 = Buffer.from(t, "base64");
  return b64.length === 64 && b64.toString("base64").replace(/=+$/, "") === t.replace(/=+$/, "") ? new Uint8Array(b64) : null;
}

/** True when `signature` is the wallet at `address` signing exactly `message`. */
export function verifySolanaSignature(address: string, message: string, signature: Uint8Array): boolean {
  const publicKey = solanaPublicKey(address);
  if (!publicKey || signature.length !== 64) return false;
  try {
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(publicKey).toString("base64url") }, format: "jwk" });
    return verify(null, Buffer.from(message, "utf8"), key, signature);
  } catch {
    return false;
  }
}

/** The session-signing key: derived from AUTH_SECRET, so it can't be confused with any other use of it. */
const sessionKey = (secret: string) => new Uint8Array(hkdfSync("sha256", secret, "productradar", "x402-agent-session", 32));

export async function createSessionToken(address: string, secret: string, issuer: string, now: Date = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(address)
    .setIssuer(issuer)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_S)
    .setJti(randomBytes(12).toString("hex"))
    .sign(sessionKey(secret));
}

/** The wallet address a session token names, or null when it's forged, expired or not ours. */
export async function verifySessionToken(token: string, secret: string, issuer: string, now: Date = new Date()): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, sessionKey(secret), { algorithms: ["HS256"], issuer, audience: AUDIENCE, currentDate: now });
    return typeof payload.sub === "string" && solanaPublicKey(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}

export const hashApiKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

/** A new API key: the key (shown once), what's stored (its hash) and a prefix to tell keys apart. */
export function newApiKey(): { key: string; hash: string; prefix: string } {
  const key = `${API_KEY_PREFIX}${bs58.encode(randomBytes(32))}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, API_KEY_PREFIX.length + 6) };
}
