import { PublicKey } from "@solana/web3.js";
import { connection, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { caller, json, unauthorized } from "@/server/payments/x402/agentAuthHttp";
import { billing, billingOff, billingStore, PRICES } from "@/server/payments/x402/billingHttp";
import { SETTLEMENT_THRESHOLD_MICROS, usdc, usdcAccountOf } from "@/server/payments/x402/solanaBilling";

// GET /api/x402/billing — the calling wallet's bill: prices, what it owes (unsettled usage and transfers in
// flight), its USDC allowance on the chain, and its recent settlements. Pay for actual usage: no balances.
export async function GET(request: NextRequest) {
  await connection();
  const who = await caller(request);
  if (!who) return unauthorized();
  const b = billing();
  if (!b.ready) return billingOff();
  const walletId = await billingStore.walletId(who.address);
  if (!walletId) return unauthorized();

  const [owed, unsettled, settlements] = await Promise.all([
    billingStore.owed(walletId),
    db.usageEvent.aggregate({ where: { walletId, settlementId: null }, _sum: { amountMicros: true }, _count: true }),
    db.settlement.findMany({
      where: { walletId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, amountMicros: true, reason: true, status: true, txSignature: true, error: true, createdAt: true, confirmedAt: true },
    }),
  ]);
  const acct = await b.chain.tokenAccount(usdcAccountOf(new PublicKey(who.address), b.config.mint)).catch(() => undefined);
  const approved = acct?.delegate?.equals(b.config.sponsor.publicKey) ?? false;
  return json({
    address: who.address,
    prices: Object.entries(PRICES).map(([endpoint, micros]) => ({ endpoint, priceUsdc: usdc(micros), note: "charged only for a 2xx answer" })),
    owedUsdc: usdc(owed),
    unsettled: { usdc: usdc(unsettled._sum.amountMicros ?? BigInt(0)), requests: unsettled._count },
    settlement: { schedule: "daily", thresholdUsdc: usdc(SETTLEMENT_THRESHOLD_MICROS), treasury: b.config.treasury.toBase58() },
    allowance:
      acct === undefined
        ? { error: "Couldn't reach the Solana network to read it." }
        : { approved, remainingUsdc: approved && acct ? usdc(acct.delegatedAmount) : "0.000000", walletUsdc: acct ? usdc(acct.amount) : "0.000000", delegate: b.config.sponsor.publicKey.toBase58() },
    settlements: settlements.map((s) => ({
      id: s.id,
      amountUsdc: usdc(s.amountMicros),
      reason: s.reason,
      status: s.status,
      signature: s.txSignature,
      error: s.status === "FAILED" ? s.error : null,
      createdAt: s.createdAt.toISOString(),
      confirmedAt: s.confirmedAt?.toISOString() ?? null,
    })),
  });
}
