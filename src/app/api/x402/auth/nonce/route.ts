import { connection, type NextRequest } from "next/server";
import { agentSite, json, rateLimited, tooMany, walletStore } from "@/server/payments/x402/agentAuthHttp";
import { requestNonce } from "@/server/payments/x402/agentWallets";

// POST /api/x402/auth/nonce { address } — step 1 of an agent's Sign-In With Solana: a fresh one-time nonce
// and the exact message to sign with that wallet. Free. (server/payments/x402/agentWallets.ts)
export async function POST(request: NextRequest) {
  await connection();
  if (rateLimited("nonce", request)) return tooMany();
  const body = (await request.json().catch(() => null)) as { address?: unknown } | null;
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const r = await requestNonce(walletStore, address, agentSite(request));
  if (!r.ok) return json({ error: r.error, message: r.message }, r.status);
  return json({
    address: r.address,
    nonce: r.nonce,
    issuedAt: r.issuedAt,
    expiresAt: r.expiresAt,
    message: r.message,
    next: "Sign `message` (its UTF-8 bytes) with this wallet's Ed25519 key, then POST { address, signature } to /api/x402/auth/verify within 5 minutes. The signature may be base58 or base64.",
  });
}
