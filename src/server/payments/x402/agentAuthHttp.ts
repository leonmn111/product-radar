// What the agent sign-in routes (/api/x402/auth/*) share: the database store, the site the sign-in message
// names, the session-token settings, per-visitor rate limits and JSON answers. Payment code only (Rule 2).

import type { NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";
import { clientAddress } from "@/server/auth/password";
import { authenticateAgent, prismaWalletStore, type Site } from "./agentWallets";

export const walletStore = prismaWalletStore(db);

/** The site the message names and the token's issuer: APP_URL, so nonce and verify always agree. */
export function agentSite(request: NextRequest): Site & { issuer: string } {
  const url = new URL(appUrl(request.nextUrl.origin));
  return { domain: url.host, uri: url.origin, issuer: url.origin };
}

export const agentAuth = (request: NextRequest) => ({ secret: env.AUTH_SECRET, issuer: agentSite(request).issuer });

const HOUR = 60 * 60_000;
const limiters = {
  nonce: createRateLimiter({ windowMs: HOUR, max: 30 }),
  verify: createRateLimiter({ windowMs: HOUR, max: 30 }),
  keys: createRateLimiter({ windowMs: HOUR, max: 20 }),
};

/** True (and counted) when this visitor has made too many requests of this kind in the last hour. */
export const rateLimited = (kind: keyof typeof limiters, request: NextRequest) => limiters[kind].limited(clientAddress(request.headers) ?? "unknown");

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const tooMany = () => json({ error: "too_many_requests", message: "Too many requests from here. Try again in an hour." }, 429, { "Retry-After": "3600" });

export const unauthorized = (message = "Send Authorization: Bearer <session token or API key>. Sign in at POST /api/x402/auth/nonce.") =>
  json({ error: "unauthorized", message }, 401, { "WWW-Authenticate": 'Bearer realm="productradar-agent-api"' });

/** The calling wallet, from its session token or API key. */
export const caller = (request: NextRequest) => authenticateAgent(walletStore, request.headers.get("authorization"), agentAuth(request));
