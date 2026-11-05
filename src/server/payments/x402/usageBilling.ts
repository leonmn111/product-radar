// x402 Tier 2 usage billing: what agents owe, and settling it in USDC. Payment code only (CLAUDE.md Rule 2).
// The chain side (allowances, transfers) is solanaBilling.ts; this is the bookkeeping, over a BillingStore.
//
//   a paid request   canCharge (the allowance covers what's owed plus this), the handler runs, and a 2xx is
//                    logged as a UsageEvent. Reaching $5 unsettled starts a settlement straight away.
//   a settlement     claims the wallet's unsettled usage (one in flight per wallet, enforced by the database),
//                    records the transfer's signature BEFORE sending it, sends, and waits:
//                      landed                 → CONFIRMED
//                      refused or expired     → FAILED, and its usage is released to be settled again
//                      unknown (a timeout)    → stays SUBMITTED; reconcile() decides later from the chain
//                    so a crash or a lost reply can never pull the same usage twice.
//   daily            reconcile(), then settle every wallet with unsettled usage (src/scripts/settle-usage.ts).

import { PublicKey } from "@solana/web3.js";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { buildSettlementTransaction, RejectedTransaction, SETTLEMENT_THRESHOLD_MICROS, type BillingConfig, type SolanaChain } from "./solanaBilling";

export type SettlementReason = "daily" | "threshold";
export type Claimed = { id: string; walletId: string; address: string; amountMicros: bigint };
export type InFlight = { id: string; walletId: string; signature: string | null; lastValidBlockHeight: bigint | null; createdAt: Date };

export interface BillingStore {
  walletId(address: string): Promise<string | null>;
  /** Unsettled usage plus settlements still in flight: what the agent's allowance must still cover. */
  owed(walletId: string): Promise<bigint>;
  /** Logs one paid request; returns the wallet's unsettled usage after it. */
  recordUsage(u: { walletId: string; apiKeyId: string | null; endpoint: string; amountMicros: bigint }): Promise<bigint>;
  /** Claims all the wallet's unsettled usage for a new settlement; null when there's none or one is in flight. */
  claim(walletId: string, reason: SettlementReason): Promise<Claimed | null>;
  markSubmitted(id: string, signature: string, lastValidBlockHeight: bigint, at: Date): Promise<void>;
  markConfirmed(id: string, at: Date): Promise<void>;
  /** Fails a settlement and releases its usage, so the next settlement collects it. */
  markFailed(id: string, error: string): Promise<void>;
  inFlight(): Promise<InFlight[]>;
  walletsWithUnsettled(): Promise<string[]>;
}

export type SettleOutcome =
  | { status: "nothing" }
  | { status: "confirmed"; settlementId: string; amountMicros: bigint; signature: string }
  | { status: "failed"; settlementId: string; error: string }
  | { status: "pending"; settlementId: string; signature: string };

/** One wallet's settlement, start to finish (or to "pending", for reconcile to finish). */
export async function settleWallet(store: BillingStore, chain: SolanaChain, cfg: BillingConfig, walletId: string, reason: SettlementReason, now = () => new Date()): Promise<SettleOutcome> {
  const claim = await store.claim(walletId, reason);
  if (!claim) return { status: "nothing" };
  let signature: string;
  let raw: Buffer;
  let lastValidBlockHeight: number;
  try {
    const recent = await chain.latestBlockhash();
    lastValidBlockHeight = recent.lastValidBlockHeight;
    ({ raw, signature } = buildSettlementTransaction(cfg, new PublicKey(claim.address), claim.amountMicros, recent));
  } catch (e) {
    // Nothing was sent: release the usage.
    const error = `couldn't prepare the transfer: ${e instanceof Error ? e.message : String(e)}`;
    await store.markFailed(claim.id, error);
    return { status: "failed", settlementId: claim.id, error };
  }
  // Recorded before sending, so whatever happens next, the transfer can be traced on the chain.
  await store.markSubmitted(claim.id, signature, BigInt(lastValidBlockHeight), now());
  try {
    await chain.sendRaw(raw);
  } catch (e) {
    if (e instanceof RejectedTransaction) {
      await store.markFailed(claim.id, `refused: ${e.message}`);
      return { status: "failed", settlementId: claim.id, error: e.message };
    }
    return { status: "pending", settlementId: claim.id, signature }; // it may have landed: reconcile() will know
  }
  const r = await chain.confirm(signature, lastValidBlockHeight);
  if (r.ok === true) {
    await store.markConfirmed(claim.id, now());
    return { status: "confirmed", settlementId: claim.id, amountMicros: claim.amountMicros, signature };
  }
  if (r.ok === false) {
    await store.markFailed(claim.id, r.error);
    return { status: "failed", settlementId: claim.id, error: r.error };
  }
  return { status: "pending", settlementId: claim.id, signature };
}

/** A settlement claimed but never sent (the process stopped in between) is released after this. */
export const STALE_PENDING_MS = 10 * 60_000;

/** Settles what the chain now knows about transfers still in flight. */
export async function reconcile(store: BillingStore, chain: SolanaChain, now = () => new Date()) {
  const out = { confirmed: 0, failed: 0, waiting: 0 };
  for (const s of await store.inFlight()) {
    if (!s.signature || s.lastValidBlockHeight === null) {
      if (now().getTime() - s.createdAt.getTime() > STALE_PENDING_MS) {
        await store.markFailed(s.id, "claimed but never sent");
        out.failed++;
      } else out.waiting++;
      continue;
    }
    const st = await chain.status(s.signature);
    if (st === "confirmed") {
      await store.markConfirmed(s.id, now());
      out.confirmed++;
    } else if (st) {
      await store.markFailed(s.id, st.failed);
      out.failed++;
    } else if (BigInt(await chain.blockHeight()) > s.lastValidBlockHeight) {
      // Past its last valid block and never seen: it can't land any more.
      await store.markFailed(s.id, "expired before it landed");
      out.failed++;
    } else out.waiting++;
  }
  return out;
}

/** The daily run: finish what's in flight, then settle every wallet that owes anything. */
export async function settleAll(store: BillingStore, chain: SolanaChain, cfg: BillingConfig, now = () => new Date()) {
  const reconciled = await reconcile(store, chain, now);
  const results: SettleOutcome[] = [];
  for (const walletId of await store.walletsWithUnsettled()) {
    try {
      results.push(await settleWallet(store, chain, cfg, walletId, "daily", now));
    } catch (e) {
      // An RPC outage mid-run: the next run (or reconcile) picks it up.
      results.push({ status: "failed", settlementId: "", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { reconciled, results };
}

/** Whether logging this request brought the wallet to the threshold for an immediate settlement. */
export const reachedThreshold = (unsettled: bigint) => unsettled >= SETTLEMENT_THRESHOLD_MICROS;

const IN_FLIGHT = ["PENDING", "SUBMITTED"] as const;

export function prismaBillingStore(db: PrismaClient): BillingStore {
  const unsettled = async (tx: Prisma.TransactionClient | PrismaClient, walletId: string) =>
    (await tx.usageEvent.aggregate({ where: { walletId, settlementId: null }, _sum: { amountMicros: true } }))._sum.amountMicros ?? BigInt(0);
  return {
    async walletId(address) {
      return (await db.wallet.findUnique({ where: { address }, select: { id: true } }))?.id ?? null;
    },
    async owed(walletId) {
      const inFlight = await db.settlement.aggregate({ where: { walletId, status: { in: [...IN_FLIGHT] } }, _sum: { amountMicros: true } });
      return (await unsettled(db, walletId)) + (inFlight._sum.amountMicros ?? BigInt(0));
    },
    async recordUsage(u) {
      await db.usageEvent.create({ data: u });
      return unsettled(db, u.walletId);
    },
    async claim(walletId, reason) {
      try {
        return await db.$transaction(async (tx) => {
          const [w] = await tx.$queryRaw<{ address: string }[]>`SELECT address FROM "Wallet" WHERE id = ${walletId}::uuid FOR UPDATE`;
          if (!w) return null;
          if (await tx.settlement.count({ where: { walletId, status: { in: [...IN_FLIGHT] } } })) return null;
          const s = await tx.settlement.create({ data: { walletId, reason, amountMicros: BigInt(0) }, select: { id: true } });
          // Claim first, then add up what was claimed: a request logged meanwhile is either in or out, never half.
          await tx.usageEvent.updateMany({ where: { walletId, settlementId: null }, data: { settlementId: s.id } });
          const amount = (await tx.usageEvent.aggregate({ where: { settlementId: s.id }, _sum: { amountMicros: true } }))._sum.amountMicros ?? BigInt(0);
          if (amount === BigInt(0)) {
            await tx.settlement.delete({ where: { id: s.id } });
            return null;
          }
          await tx.settlement.update({ where: { id: s.id }, data: { amountMicros: amount } });
          return { id: s.id, walletId, address: w.address, amountMicros: amount };
        });
      } catch (e) {
        // Another process claimed this wallet at the same moment (the one-in-flight index): nothing to do.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
        throw e;
      }
    },
    async markSubmitted(id, txSignature, lastValidBlockHeight, at) {
      await db.settlement.update({ where: { id }, data: { status: "SUBMITTED", txSignature, lastValidBlockHeight, submittedAt: at } });
    },
    async markConfirmed(id, at) {
      await db.settlement.update({ where: { id }, data: { status: "CONFIRMED", confirmedAt: at, error: null } });
    },
    async markFailed(id, error) {
      await db.$transaction([
        db.usageEvent.updateMany({ where: { settlementId: id }, data: { settlementId: null } }),
        db.settlement.update({ where: { id }, data: { status: "FAILED", error: error.slice(0, 1000) } }),
      ]);
    },
    async inFlight() {
      const rows = await db.settlement.findMany({
        where: { status: { in: [...IN_FLIGHT] } },
        select: { id: true, walletId: true, txSignature: true, lastValidBlockHeight: true, createdAt: true },
      });
      return rows.map((r) => ({ id: r.id, walletId: r.walletId, signature: r.txSignature, lastValidBlockHeight: r.lastValidBlockHeight, createdAt: r.createdAt }));
    },
    async walletsWithUnsettled() {
      const rows = await db.usageEvent.groupBy({ by: ["walletId"], where: { settlementId: null } });
      return rows.map((r) => r.walletId);
    },
  };
}
