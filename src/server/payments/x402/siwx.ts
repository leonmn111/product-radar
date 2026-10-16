// Sign-In-With-X: the x402 v2 "sign-in-with-x" extension (CAIP-122; EIP-4361 "Sign-In with Ethereum"
// for EVM wallets). A wallet that already paid for a resource signs a short message to prove it, and
// reopens the purchase without paying again. Payment code only (CLAUDE.md Rule 2).
//
//   402 response    extensions["sign-in-with-x"] = { info, supportedChains, schema }: the challenge
//   client          signs the EIP-4361 text built from `info` (EIP-191 personal_sign), and sends it back
//                   as SIGN-IN-WITH-X: base64(JSON payload)
//   this server     checks domain, URI, age (5 minutes) and signature, finds a settled payment by that
//                   wallet for this exact path, and spends the message nonce once (replay protection)
//
// Wire format and checks match the reference implementation, @x402/extensions 2.28 (sign-in-with-x).
// EVM wallets that sign with their own key (EOAs) are supported; smart-contract wallets (EIP-1271)
// would need an on-chain check and fall back to paying.

import { randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "viem";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export const HEADER_SIWX = "SIGN-IN-WITH-X";
export const SIWX_EXTENSION = "sign-in-with-x";
/** How long a signed message is accepted after it was issued. */
export const SIWX_MAX_AGE_MS = 5 * 60_000;
const CLOCK_SKEW_MS = 60_000;
const STATEMENT = "Sign in to reopen a ProductRadar purchase you already paid for. Signing costs nothing.";

export type SiwxInfo = {
  domain: string;
  uri: string;
  statement: string;
  version: "1";
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  resources: string[];
};
export type SiwxExtension = {
  info: SiwxInfo;
  supportedChains: { chainId: string; type: "eip191" }[];
  schema: Record<string, unknown>;
};

/** The challenge a 402 carries: what the wallet signs to reopen `url` (its query string is ignored). */
export function siwxChallenge(url: URL, network: string, now: Date = new Date()): SiwxExtension {
  const uri = `${url.origin}${url.pathname}`;
  return {
    info: {
      domain: url.host,
      uri,
      statement: STATEMENT,
      version: "1",
      nonce: randomBytes(16).toString("hex"),
      issuedAt: now.toISOString(),
      expirationTime: new Date(now.getTime() + SIWX_MAX_AGE_MS).toISOString(),
      resources: [uri],
    },
    supportedChains: [{ chainId: network, type: "eip191" }],
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        ...Object.fromEntries(
          ["domain", "address", "statement", "uri", "version", "chainId", "type", "nonce", "issuedAt", "expirationTime", "notBefore", "requestId", "signature"].map((k) => [k, { type: "string" }]),
        ),
        resources: { type: "array", items: { type: "string", format: "uri" } },
      },
      required: ["domain", "address", "uri", "version", "chainId", "type", "nonce", "issuedAt", "signature"],
    },
  };
}

const PayloadSchema = z.object({
  domain: z.string().min(1),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "invalid address"),
  statement: z.string().optional(),
  uri: z.string().min(1),
  version: z.literal("1"),
  chainId: z.string().regex(/^eip155:\d+$/, "only EVM (eip155) wallets are supported"),
  type: z.literal("eip191"),
  nonce: z.string().regex(/^[A-Za-z0-9]{8,128}$/, "invalid nonce"),
  issuedAt: z.string().min(1),
  expirationTime: z.string().optional(),
  notBefore: z.string().optional(),
  requestId: z.string().optional(),
  resources: z.array(z.string()).optional(),
  signatureScheme: z.string().optional(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "invalid signature"),
});
export type SiwxPayload = z.infer<typeof PayloadSchema>;

/** The EIP-4361 message text for a payload, every field exactly as the wallet signed it. */
export function formatSiweMessage(p: Omit<SiwxPayload, "signature" | "type" | "signatureScheme">): string {
  const lines = [`${p.domain} wants you to sign in with your Ethereum account:`, p.address, ""];
  if (p.statement) lines.push(p.statement);
  lines.push("", `URI: ${p.uri}`, `Version: ${p.version}`, `Chain ID: ${p.chainId.slice("eip155:".length)}`, `Nonce: ${p.nonce}`, `Issued At: ${p.issuedAt}`);
  if (p.expirationTime) lines.push(`Expiration Time: ${p.expirationTime}`);
  if (p.notBefore) lines.push(`Not Before: ${p.notBefore}`);
  if (p.requestId) lines.push(`Request ID: ${p.requestId}`);
  if (p.resources?.length) lines.push("Resources:", ...p.resources.map((r) => `- ${r}`));
  return lines.join("\n");
}

export type SiwxCheck = { ok: true; address: `0x${string}`; nonce: string } | { ok: false; reason: string };

const fail = (reason: string): SiwxCheck => ({ ok: false, reason });
const time = (s: string | undefined) => (s === undefined ? undefined : new Date(s).getTime());

/**
 * Checks a SIGN-IN-WITH-X header against the request it came with: the right site, this exact path,
 * the payment network, fresh, and signed by the wallet it names. Says nothing yet about payment.
 */
export async function verifySiwx(header: string, expected: { url: URL; network: string }, now: Date = new Date()): Promise<SiwxCheck> {
  let payload: SiwxPayload;
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(header) || header.length > 16_384) return fail("invalid_siwx_header");
    payload = PayloadSchema.parse(JSON.parse(Buffer.from(header, "base64").toString("utf8")));
  } catch {
    return fail("invalid_siwx_header");
  }
  if (payload.domain !== expected.url.host) return fail("invalid_siwx_domain_mismatch");
  let uri: URL;
  try {
    uri = new URL(payload.uri);
  } catch {
    return fail("invalid_siwx_uri_mismatch");
  }
  // Bound to this exact resource, not just this site: a proof for one Dossier can't open another.
  if (uri.origin !== expected.url.origin || uri.pathname !== expected.url.pathname) return fail("invalid_siwx_uri_mismatch");
  if (payload.chainId !== expected.network) return fail("invalid_siwx_unsupported_chain");

  const t = now.getTime();
  const issued = time(payload.issuedAt)!;
  if (!Number.isFinite(issued)) return fail("invalid_siwx_issued_at");
  if (t - issued > SIWX_MAX_AGE_MS) return fail("invalid_siwx_issued_at_too_old");
  if (issued - t > CLOCK_SKEW_MS) return fail("invalid_siwx_issued_at_in_future");
  const expires = time(payload.expirationTime);
  if (expires !== undefined && !(expires > t)) return fail("invalid_siwx_expired");
  const notBefore = time(payload.notBefore);
  if (notBefore !== undefined && !(notBefore <= t)) return fail("invalid_siwx_not_yet_valid");

  const address = payload.address as `0x${string}`;
  let valid = false;
  try {
    valid = await verifyMessage({ address, message: formatSiweMessage(payload), signature: payload.signature as `0x${string}` });
  } catch {
    valid = false;
  }
  if (!valid) return fail("invalid_siwx_signature");
  return { ok: true, address: getAddress(address), nonce: payload.nonce };
}

/** What `address` bought at `resourcePath` (the newest settled purchase's reference), or null. */
export async function paidReference(address: string, resourcePath: string): Promise<string | null> {
  const row = await db.agentPayment.findFirst({
    where: { payer: { equals: address, mode: "insensitive" }, resourcePath, status: "SETTLED", reference: { not: null } },
    orderBy: { settledAt: "desc" },
    select: { reference: true },
  });
  return row?.reference ?? null;
}

/** Spends a signed message's nonce: true the first time, false if it was already used. */
export async function spendSiwxNonce(nonce: string, address: string, now: Date = new Date()): Promise<boolean> {
  // Older messages fail the age check anyway, so their nonces needn't be kept.
  await db.siwxNonce.deleteMany({ where: { usedAt: { lt: new Date(now.getTime() - 2 * (SIWX_MAX_AGE_MS + CLOCK_SKEW_MS)) } } });
  try {
    await db.siwxNonce.create({ data: { nonce, address } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}
