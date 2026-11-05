import { PublicKey } from "@solana/web3.js";
import { connection, type NextRequest } from "next/server";
import { caller, json, rateLimited, tooMany, unauthorized } from "@/server/payments/x402/agentAuthHttp";
import { billing, billingOff, chainUnavailable } from "@/server/payments/x402/billingHttp";
import {
  buildApproveTransaction,
  DEFAULT_ALLOWANCE_MICROS,
  MAX_ALLOWANCE_MICROS,
  MICROS_PER_USDC,
  usdc,
  usdcAccountOf,
  usdcToMicros,
} from "@/server/payments/x402/solanaBilling";

// POST /api/x402/billing/approve { amountUsdc? } — the transaction that lets ProductRadar collect this
// wallet's usage: an SPL Token approval of up to amountUsdc (default 10, at most 25) of its USDC, to
// ProductRadar's sponsor wallet. The sponsor has already signed it as fee payer, so the agent needs no SOL:
// it adds its own signature and POSTs it to /api/x402/billing/submit. Nothing moves until usage is settled.
export async function POST(request: NextRequest) {
  await connection();
  if (rateLimited("keys", request)) return tooMany();
  const who = await caller(request);
  if (!who) return unauthorized();
  const b = billing();
  if (!b.ready) return billingOff();

  const body = (await request.json().catch(() => ({}))) as { amountUsdc?: unknown } | null;
  const asked = body?.amountUsdc === undefined ? DEFAULT_ALLOWANCE_MICROS : usdcToMicros(String(body.amountUsdc));
  if (asked === null || asked < MICROS_PER_USDC || asked > MAX_ALLOWANCE_MICROS) {
    return json({ error: "invalid_amount", message: `amountUsdc must be between 1 and ${usdc(MAX_ALLOWANCE_MICROS)} USDC.` }, 400);
  }
  const agent = new PublicKey(who.address);
  try {
    if (!(await b.chain.tokenAccount(usdcAccountOf(agent, b.config.mint)))) {
      return json({ error: "no_usdc_account", message: "This wallet has no USDC account yet. Receive some USDC first, then approve." }, 409);
    }
    const recent = await b.chain.latestBlockhash();
    return json({
      transaction: buildApproveTransaction(b.config, agent, asked, recent),
      encoding: "base64",
      allowanceUsdc: usdc(asked),
      delegate: b.config.sponsor.publicKey.toBase58(),
      treasury: b.config.treasury.toBase58(),
      mint: b.config.mint.toBase58(),
      lastValidBlockHeight: recent.lastValidBlockHeight,
      next: "Sign this transaction with your wallet (ProductRadar has signed as fee payer, so you need no SOL), then POST { transaction } (base64) to /api/x402/billing/submit within about a minute. It approves an allowance only: USDC moves when your usage is settled, daily or at $5, to the treasury.",
    });
  } catch (e) {
    console.error("[x402 billing] approve failed", e instanceof Error ? e.message : e);
    return chainUnavailable();
  }
}
