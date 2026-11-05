import { PublicKey } from "@solana/web3.js";
import { connection, type NextRequest } from "next/server";
import { caller, json, rateLimited, tooMany, unauthorized } from "@/server/payments/x402/agentAuthHttp";
import { billing, billingOff, chainUnavailable } from "@/server/payments/x402/billingHttp";
import { checkSignedApproval, RejectedTransaction, usdc } from "@/server/payments/x402/solanaBilling";

const BLOCKHASH_LIFETIME = 151;

// POST /api/x402/billing/submit { transaction } — broadcasts an approval from /api/x402/billing/approve once the
// agent has signed it. Only that exact transaction, approving ProductRadar on the caller's own USDC account,
// is ever sent: the sponsor pays its fee, never anyone else's.
export async function POST(request: NextRequest) {
  await connection();
  if (rateLimited("keys", request)) return tooMany();
  const who = await caller(request);
  if (!who) return unauthorized();
  const b = billing();
  if (!b.ready) return billingOff();

  const body = (await request.json().catch(() => null)) as { transaction?: unknown } | null;
  if (typeof body?.transaction !== "string" || body.transaction.length > 4_000) {
    return json({ error: "invalid_request", message: "Send { transaction }: the base64 transaction from /api/x402/billing/approve, signed by your wallet." }, 400);
  }
  const checked = checkSignedApproval(b.config, new PublicKey(who.address), body.transaction);
  if (!checked.ok) return json({ error: "invalid_transaction", message: `Not sent: ${checked.reason}.` }, 400);
  try {
    // A blockhash stays valid for about 150 blocks, so the approval lands within that or never: wait no longer.
    const deadline = (await b.chain.blockHeight()) + BLOCKHASH_LIFETIME;
    const signature = await b.chain.sendRaw(checked.raw);
    const landed = await b.chain.confirm(signature, deadline);
    if (landed.ok === false) return json({ error: "approval_failed", message: `The approval didn't land: ${landed.error}. Ask for a new one.`, signature }, 409);
    return json({
      signature,
      status: landed.ok === true ? "confirmed" : "sent",
      allowanceUsdc: usdc(checked.amount),
      explorer: `https://solscan.io/tx/${signature}`,
      next: "You can now call paid endpoints with your API key, e.g. GET /api/x402/catalog/search?q=...",
    });
  } catch (e) {
    if (e instanceof RejectedTransaction) return json({ error: "approval_refused", message: `The network refused the approval: ${e.message}` }, 400);
    console.error("[x402 billing] submit failed", e instanceof Error ? e.message : e);
    return chainUnavailable();
  }
}
