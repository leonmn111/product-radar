import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { caller, json, rateLimited, tooMany, unauthorized, walletStore } from "@/server/payments/x402/agentAuthHttp";
import { issueApiKey } from "@/server/payments/x402/agentWallets";

// POST   /api/x402/auth/api-keys          → a new API key for the signed-in wallet, shown once (201)
// DELETE /api/x402/auth/api-keys { id }   → revokes one of its keys
// Both need the wallet's session token (an API key can't make or revoke keys), so a leaked key can be
// revoked by signing in again with the wallet.

export async function POST(request: NextRequest) {
  await connection();
  if (rateLimited("keys", request)) return tooMany();
  const who = await caller(request);
  if (!who) return unauthorized();
  if (who.via !== "session") return unauthorized("Making API keys needs a session token from signing in with the wallet, not an API key.");
  const r = await issueApiKey(walletStore, who.address);
  if (!r.ok) return json({ error: r.error, message: r.message }, r.status);
  return json({ apiKey: r.apiKey, id: r.id, prefix: r.prefix, createdAt: r.createdAt, note: "This is the only time the key is shown: store it securely. Send it as Authorization: Bearer <apiKey>." }, 201);
}

const Revoke = z.object({ id: z.uuid() });

export async function DELETE(request: NextRequest) {
  await connection();
  if (rateLimited("keys", request)) return tooMany();
  const who = await caller(request);
  if (!who) return unauthorized();
  if (who.via !== "session") return unauthorized("Revoking API keys needs a session token from signing in with the wallet.");
  const parsed = Revoke.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_request", message: "Send { id } with the key's id from GET /api/x402/auth/me." }, 400);
  const revoked = await walletStore.revokeKey(who.address, parsed.data.id, new Date());
  return revoked ? json({ revoked: parsed.data.id }) : json({ error: "not_found", message: "No active key with that id on this wallet." }, 404);
}
