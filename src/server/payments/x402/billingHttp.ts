// What the Solana-billed routes share (x402 Tier 2): the billing setup, and withUsageBilling, which puts a
// paid endpoint behind an agent's API key and logs what it used. Payment code only (CLAUDE.md Rule 2): the
// handler it wraps knows nothing about payment.

import { PublicKey } from "@solana/web3.js";
import { after, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { caller, json, unauthorized } from "./agentAuthHttp";
import { billingConfig, canCharge, createSolanaChain, usdc, usdcToMicros, type BillingConfig, type SolanaChain } from "./solanaBilling";
import { prismaBillingStore, reachedThreshold, settleWallet } from "./usageBilling";

/** Prices of the Solana-billed endpoints, in USDC micro-units. */
export const PRICES = {
  "GET /api/x402/catalog/search": usdcToMicros("0.05")!,
} as const;

export const billingStore = prismaBillingStore(db);

let setup: { config: BillingConfig; chain: SolanaChain } | null = null;

/** The billing setup, or why it's off (no sponsor key yet). */
export function billing(): { ready: true; config: BillingConfig; chain: SolanaChain } | { ready: false } {
  if (setup) return { ready: true, ...setup };
  const status = billingConfig(env);
  if (!status.ready) return { ready: false };
  setup = { config: status.config, chain: createSolanaChain(status.config.rpcUrl) };
  return { ready: true, ...setup };
}

export const billingOff = () =>
  json({ error: "billing_unavailable", message: "Pay-per-request billing in Solana USDC isn't switched on yet. Nothing was charged." }, 503);

export const chainUnavailable = () =>
  json({ error: "solana_unavailable", message: "We couldn't reach the Solana network just now. Nothing was charged; try again shortly." }, 503, { "Retry-After": "30" });

/**
 * A paid endpoint for signed-in agents: checks the agent's USDC allowance covers what it owes plus this
 * request, runs the handler, and logs the price only for a 2xx answer. At $5 unsettled, the wallet is
 * settled straight away, after the response is sent.
 */
export function withUsageBilling(endpoint: keyof typeof PRICES, handler: (request: NextRequest) => Promise<Response>) {
  const price = PRICES[endpoint];
  return async (request: NextRequest): Promise<Response> => {
    const who = await caller(request);
    if (!who) return unauthorized();
    const b = billing();
    if (!b.ready) return billingOff();
    const walletId = await billingStore.walletId(who.address);
    if (!walletId) return unauthorized();

    let check;
    try {
      check = await canCharge(b.chain, b.config, new PublicKey(who.address), await billingStore.owed(walletId), price);
    } catch (e) {
      console.error("[x402 billing] allowance check failed", e instanceof Error ? e.message : e);
      return chainUnavailable();
    }
    if (!check.ok) return json({ error: check.error, message: check.message, priceUsdc: usdc(price), approve: "/api/x402/billing/approve" }, 402);

    const res = await handler(request);
    if (res.status < 200 || res.status >= 300) return res; // not charged

    const unsettled = await billingStore.recordUsage({ walletId, apiKeyId: who.keyId, endpoint, amountMicros: price });
    if (reachedThreshold(unsettled)) {
      after(async () => {
        try {
          const r = await settleWallet(billingStore, b.chain, b.config, walletId, "threshold");
          console.log("[x402 billing] threshold settlement", walletId, r.status, "settlementId" in r ? r.settlementId : "");
        } catch (e) {
          console.error("[x402 billing] threshold settlement failed; the daily run will retry", walletId, e instanceof Error ? e.message : e);
        }
      });
    }
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Usage-Charged-USDC", usdc(price));
    headers.set("X-Usage-Unsettled-USDC", usdc(unsettled));
    return new Response(res.body, { status: res.status, headers });
  };
}
