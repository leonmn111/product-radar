// The daily settlement (x402 Tier 2): finishes any USDC transfer still in flight, then settles every agent
// wallet with unsettled usage in one transfer each, from its USDC account to the treasury, under the
// allowance it approved (server/payments/x402/usageBilling.ts). Safe to run twice: usage is claimed once.
//
// Usage: npm run x402:settle   (a Railway cron service runs it daily; see the deploy notes)

import "dotenv/config";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { billingConfig, createSolanaChain, usdc } from "@/server/payments/x402/solanaBilling";
import { prismaBillingStore, settleAll } from "@/server/payments/x402/usageBilling";

async function main() {
  const status = billingConfig(env);
  if (!status.ready) throw new Error(`Billing is off: ${status.missing.join("; ")}`);
  const cfg = status.config;
  const chain = createSolanaChain(cfg.rpcUrl);
  console.log(`Settling into treasury ${cfg.treasury.toBase58()} (sponsor ${cfg.sponsor.publicKey.toBase58()}).`);
  const { reconciled, results } = await settleAll(prismaBillingStore(db), chain, cfg);
  console.log(`In flight before this run: ${reconciled.confirmed} confirmed, ${reconciled.failed} failed (released), ${reconciled.waiting} still waiting.`);
  for (const r of results) {
    if (r.status === "confirmed") console.log(`  CONFIRMED  $${usdc(r.amountMicros)}  ${r.signature}`);
    else if (r.status === "pending") console.log(`  PENDING    ${r.signature} (the next run checks it)`);
    else if (r.status === "failed") console.log(`  FAILED     ${r.settlementId}: ${r.error} (its usage stays owed)`);
  }
  console.log(`${results.filter((r) => r.status === "confirmed").length} of ${results.length} wallet(s) settled.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
