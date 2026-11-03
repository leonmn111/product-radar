import { connection, type NextRequest } from "next/server";
import { agentAuth, agentSite, json, rateLimited, tooMany, walletStore } from "@/server/payments/x402/agentAuthHttp";
import { verifySignIn } from "@/server/payments/x402/agentWallets";

// POST /api/x402/auth/verify { address, signature } — step 2: checks the wallet's Ed25519 signature over the
// message from /api/x402/auth/nonce, spends the nonce, and returns a one-hour session token. Free.
export async function POST(request: NextRequest) {
  await connection();
  if (rateLimited("verify", request)) return tooMany();
  const body = (await request.json().catch(() => null)) as { address?: unknown; signature?: unknown } | null;
  const input = { address: typeof body?.address === "string" ? body.address.trim() : "", signature: typeof body?.signature === "string" ? body.signature : "" };
  const r = await verifySignIn(walletStore, input, agentSite(request), agentAuth(request));
  if (!r.ok) return json({ error: r.error, message: r.message }, r.status);
  return json({ tokenType: r.tokenType, token: r.token, expiresIn: r.expiresIn, address: r.address, next: "Send Authorization: Bearer <token>. POST /api/x402/auth/api-keys for a long-lived API key." });
}
