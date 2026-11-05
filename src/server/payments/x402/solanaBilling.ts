// x402 Tier 2, the Solana side of pay-per-request: agents pay in USDC for what they actually used, with no
// prepaid balances (owner decision, 5 November 2026). Payment code only (CLAUDE.md Rule 2).
//
// Nobody can move USDC out of a wallet without that wallet's signature, so an agent signs once to approve
// the server's sponsor wallet as a delegate of its USDC account, up to an allowance (SPL Token
// ApproveChecked). The sponsor then:
//   - pays the SOL network fee for that approval (the agent needs no SOL): it signs the transaction first,
//     as fee payer, and hands it to the agent to add its own signature;
//   - pulls what's owed into the treasury in one TransferChecked per settlement (daily, or at $5), paying
//     that fee too. It can only spend what the agent approved, and the agent can revoke at any time.
// The sponsor holds only SOL for fees; USDC goes straight to the treasury's USDC account.

import {
  createApproveCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  decodeApproveCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  unpackAccount,
} from "@solana/spl-token";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SendTransactionError, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

/** Circle's USDC on Solana mainnet (6 decimals, classic SPL Token program). */
export const USDC_MAINNET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** The owner's treasury wallet (directive of 5 November 2026); its USDC account already exists. */
export const DEFAULT_TREASURY = "5nggd832fCRBSinVXdEHc1E6QR6DK8r2GfYycUDPtPgx";
export const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
export const USDC_DECIMALS = 6;

/** USDC micro-units: 1 = $0.000001. Every amount is an integer of these, never a float. */
export const MICROS_PER_USDC = BigInt(1_000_000);
export const usdc = (micros: bigint) => {
  const sign = micros < BigInt(0) ? "-" : "";
  const m = micros < BigInt(0) ? -micros : micros;
  return `${sign}${m / MICROS_PER_USDC}.${(m % MICROS_PER_USDC).toString().padStart(6, "0")}`;
};
/** "10", "2.5", "0.05" → micro-units; null for anything else (more than 6 decimals, negative, junk). */
export function usdcToMicros(v: string | number): bigint | null {
  const s = String(v).trim();
  const m = /^(\d{1,9})(?:\.(\d{1,6}))?$/.exec(s);
  return m ? BigInt(m[1]) * MICROS_PER_USDC + BigInt((m[2] ?? "").padEnd(6, "0")) : null;
}

/** Settle a wallet at once when what it owes reaches this, rather than waiting for the daily run. */
export const SETTLEMENT_THRESHOLD_MICROS = BigInt(5) * MICROS_PER_USDC;
/** The most an agent may approve in one go: bounds what a leaked sponsor key could ever pull. */
export const MAX_ALLOWANCE_MICROS = BigInt(25) * MICROS_PER_USDC;
export const DEFAULT_ALLOWANCE_MICROS = BigInt(10) * MICROS_PER_USDC;
/** A small priority fee so transfers land when the network is busy: about 600 lamports a transfer. */
const COMPUTE_UNITS = 60_000;
const MICRO_LAMPORTS_PER_UNIT = 10_000;

export type BillingConfig = { sponsor: Keypair; treasury: PublicKey; mint: PublicKey; rpcUrl: string };
export type BillingConfigStatus = { ready: true; config: BillingConfig } | { ready: false; missing: string[] };

const publicKey = (s: string) => {
  try {
    return new PublicKey(s);
  } catch {
    return null;
  }
};

/** Billing is on only when the sponsor key is set and every address is valid. */
export function billingConfig(env: {
  SOLANA_SPONSOR_SECRET_KEY?: string;
  SOLANA_RPC_URL?: string;
  SOLANA_TREASURY?: string;
  SOLANA_USDC_MINT?: string;
}): BillingConfigStatus {
  const missing: string[] = [];
  let sponsor: Keypair | null = null;
  if (!env.SOLANA_SPONSOR_SECRET_KEY) missing.push("SOLANA_SPONSOR_SECRET_KEY is not set");
  else {
    try {
      sponsor = Keypair.fromSecretKey(bs58.decode(env.SOLANA_SPONSOR_SECRET_KEY.trim()));
    } catch {
      missing.push("SOLANA_SPONSOR_SECRET_KEY isn't a base58 64-byte Solana secret key");
    }
  }
  const treasury = publicKey(env.SOLANA_TREASURY || DEFAULT_TREASURY);
  if (!treasury) missing.push("SOLANA_TREASURY isn't a Solana address");
  const mint = publicKey(env.SOLANA_USDC_MINT || USDC_MAINNET_MINT);
  if (!mint) missing.push("SOLANA_USDC_MINT isn't a Solana address");
  if (sponsor && treasury && sponsor.publicKey.equals(treasury)) missing.push("the sponsor wallet must not be the treasury");
  return sponsor && treasury && mint && !missing.length
    ? { ready: true, config: { sponsor, treasury, mint, rpcUrl: env.SOLANA_RPC_URL || DEFAULT_RPC_URL } }
    : { ready: false, missing };
}

/** An agent's USDC account as the chain has it. */
export type TokenAccountState = { amount: bigint; delegate: PublicKey | null; delegatedAmount: bigint; isFrozen: boolean };

export type ConfirmResult = { ok: true } | { ok: false; error: string } | { ok: "unknown" };

/** The few chain operations billing needs, so the flows can be tested without a network. */
export interface SolanaChain {
  tokenAccount(address: PublicKey): Promise<TokenAccountState | null>;
  latestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  /** Broadcasts a signed transaction. Throws RejectedTransaction when the network refused it outright. */
  sendRaw(raw: Buffer): Promise<string>;
  /** Waits for a sent transaction: landed, failed, or still unknown after the wait. */
  confirm(signature: string, lastValidBlockHeight: number): Promise<ConfirmResult>;
  /** A sent transaction's fate: landed, failed, or not seen (yet). */
  status(signature: string): Promise<"confirmed" | { failed: string } | null>;
  blockHeight(): Promise<number>;
}

/** The network refused a transaction before running it (e.g. the allowance or USDC ran out): it can't land. */
export class RejectedTransaction extends Error {}

const RPC_TIMEOUT_MS = 15_000;

export function createSolanaChain(rpcUrl: string, { pollMs = 2_000, waitMs = 60_000 } = {}): SolanaChain {
  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(RPC_TIMEOUT_MS) }),
  });
  const status = async (signature: string) => {
    const s = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (!s) return null;
    if (s.err) return { failed: JSON.stringify(s.err) };
    return s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized" ? ("confirmed" as const) : null;
  };
  return {
    async tokenAccount(address) {
      const info = await connection.getAccountInfo(address);
      if (!info) return null;
      const a = unpackAccount(address, info, TOKEN_PROGRAM_ID);
      return { amount: a.amount, delegate: a.delegate, delegatedAmount: a.delegatedAmount, isFrozen: a.isFrozen };
    },
    latestBlockhash: () => connection.getLatestBlockhash("confirmed"),
    async sendRaw(raw) {
      try {
        return await connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 });
      } catch (e) {
        // A preflight refusal means the transaction was never run; anything else (a timeout) is unknown.
        if (e instanceof SendTransactionError) throw new RejectedTransaction(e.message.slice(0, 500));
        throw e;
      }
    },
    async confirm(signature, lastValidBlockHeight) {
      const until = Date.now() + waitMs;
      while (Date.now() < until) {
        const s = await status(signature).catch(() => null);
        if (s === "confirmed") return { ok: true };
        if (s) return { ok: false, error: s.failed };
        if ((await connection.getBlockHeight("confirmed").catch(() => 0)) > lastValidBlockHeight) return { ok: false, error: "expired before it landed" };
        await new Promise((r) => setTimeout(r, pollMs));
      }
      return { ok: "unknown" };
    },
    status,
    blockHeight: () => connection.getBlockHeight("confirmed"),
  };
}

export const usdcAccountOf = (owner: PublicKey, mint: PublicKey) => getAssociatedTokenAddressSync(mint, owner);

/**
 * The approval an agent signs: let the sponsor collect up to `amount` USDC from its USDC account. The sponsor
 * pays the fee and signs first; the agent adds its signature and sends it (or posts it to /billing/submit).
 */
export function buildApproveTransaction(cfg: BillingConfig, agent: PublicKey, amount: bigint, recent: { blockhash: string; lastValidBlockHeight: number }) {
  const tx = new Transaction({ feePayer: cfg.sponsor.publicKey, ...recent }).add(
    createApproveCheckedInstruction(usdcAccountOf(agent, cfg.mint), cfg.mint, cfg.sponsor.publicKey, agent, amount, USDC_DECIMALS),
  );
  tx.partialSign(cfg.sponsor);
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

/**
 * Checks an approval the agent signed before the sponsor broadcasts it: it must be the sponsor's own,
 * untouched (its signature covers every byte), approving the sponsor on this agent's USDC account, and
 * signed by the agent. Returns the raw transaction to send, or why not.
 */
export function checkSignedApproval(cfg: BillingConfig, agent: PublicKey, base64: string): { ok: true; raw: Buffer; amount: bigint } | { ok: false; reason: string } {
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(base64, "base64"));
  } catch {
    return { ok: false, reason: "transaction isn't a base64 serialized Solana transaction" };
  }
  if (!tx.feePayer?.equals(cfg.sponsor.publicKey)) return { ok: false, reason: "it wasn't issued by /api/x402/billing/approve" };
  if (tx.instructions.length !== 1) return { ok: false, reason: "it must hold only the approval" };
  let approve: ReturnType<typeof decodeApproveCheckedInstruction>;
  try {
    approve = decodeApproveCheckedInstruction(tx.instructions[0], TOKEN_PROGRAM_ID);
  } catch {
    return { ok: false, reason: "its instruction isn't a USDC approval" };
  }
  const k = approve.keys;
  if (!k.account.pubkey.equals(usdcAccountOf(agent, cfg.mint)) || !k.mint.pubkey.equals(cfg.mint) || !k.delegate.pubkey.equals(cfg.sponsor.publicKey) || !k.owner.pubkey.equals(agent)) {
    return { ok: false, reason: "it doesn't approve ProductRadar on this wallet's USDC account" };
  }
  if (approve.data.amount > MAX_ALLOWANCE_MICROS) return { ok: false, reason: "the allowance is over the maximum" };
  // Every signature present and valid: the sponsor's (proving the bytes are ours) and the agent's.
  if (!tx.verifySignatures(true)) return { ok: false, reason: "it isn't signed by both the wallet and ProductRadar, or it was changed after signing" };
  return { ok: true, raw: tx.serialize(), amount: approve.data.amount };
}

/** A settlement: one USDC transfer of `amount` from the agent's account to the treasury's, by the sponsor as delegate. */
export function buildSettlementTransaction(cfg: BillingConfig, agent: PublicKey, amount: bigint, recent: { blockhash: string; lastValidBlockHeight: number }) {
  const treasuryUsdc = usdcAccountOf(cfg.treasury, cfg.mint);
  const tx = new Transaction({ feePayer: cfg.sponsor.publicKey, ...recent }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: MICRO_LAMPORTS_PER_UNIT }),
    // Free when the treasury's USDC account exists (it does); otherwise the sponsor opens it once.
    createAssociatedTokenAccountIdempotentInstruction(cfg.sponsor.publicKey, treasuryUsdc, cfg.treasury, cfg.mint),
    createTransferCheckedInstruction(usdcAccountOf(agent, cfg.mint), cfg.mint, treasuryUsdc, cfg.sponsor.publicKey, amount, USDC_DECIMALS),
  );
  tx.sign(cfg.sponsor);
  return { raw: tx.serialize(), signature: bs58.encode(tx.signature!) };
}

export type ChargeCheck = { ok: true } | { ok: false; status: 402; error: string; message: string };

/**
 * Whether the agent can pay for one more request: its USDC account must have approved the sponsor for, and
 * hold, everything it already owes plus `price`. Reads the chain (one RPC call); a failing RPC throws.
 */
export async function canCharge(chain: SolanaChain, cfg: BillingConfig, agent: PublicKey, owed: bigint, price: bigint): Promise<ChargeCheck> {
  const need = owed + price;
  const acct = await chain.tokenAccount(usdcAccountOf(agent, cfg.mint));
  const approve = `Approve ProductRadar to collect your usage: POST /api/x402/billing/approve, sign the transaction, then POST it to /api/x402/billing/submit (we pay the SOL fee).`;
  const no = (error: string, message: string): ChargeCheck => ({ ok: false, status: 402, error, message });
  if (!acct) return no("no_usdc_account", "This wallet has no USDC account. Fund it with USDC, then approve ProductRadar to collect your usage.");
  if (acct.isFrozen) return no("usdc_account_frozen", "This wallet's USDC account is frozen.");
  if (!acct.delegate?.equals(cfg.sponsor.publicKey)) return no("no_allowance", `Payment required. ${approve}`);
  if (acct.delegatedAmount < need) {
    return no("allowance_too_low", `Your approved allowance has $${usdc(acct.delegatedAmount)} left; this request needs $${usdc(need)} (what you owe plus this request). ${approve}`);
  }
  if (acct.amount < need) return no("insufficient_usdc", `This wallet holds $${usdc(acct.amount)} USDC; this request needs $${usdc(need)} (what you owe plus this request).`);
  return { ok: true };
}
