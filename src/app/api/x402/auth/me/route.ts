import { connection, type NextRequest } from "next/server";
import { caller, json, unauthorized, walletStore } from "@/server/payments/x402/agentAuthHttp";

// GET /api/x402/auth/me — the calling wallet (by session token or API key): its address, USDC balance and
// active API keys (ids and prefixes only; keys are never shown again).
export async function GET(request: NextRequest) {
  await connection();
  const who = await caller(request);
  if (!who) return unauthorized();
  const wallet = await walletStore.wallet(who.address);
  return wallet ? json({ ...wallet, authenticatedWith: who.via }) : unauthorized();
}
