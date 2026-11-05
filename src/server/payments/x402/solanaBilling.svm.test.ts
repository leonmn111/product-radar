// The billing transactions run through Solana's real programs (SPL Token, Associated Token Account, Compute
// Budget) in LiteSVM, an in-process Solana runtime: no network, no real funds. Proves an agent with no SOL
// can approve, the sponsor pays every fee, settlements pull exactly what's owed into the treasury, and a
// revoked or exhausted allowance is refused and leaves the usage owed.

import {
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createRevokeInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  unpackAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import { describe, expect, it } from "vitest";
import { billingConfig, buildApproveTransaction, canCharge, checkSignedApproval, DEFAULT_TREASURY, RejectedTransaction, usdcAccountOf, usdcToMicros, type SolanaChain } from "./solanaBilling";
import { memoryBillingStore } from "./testBillingStore";
import { settleWallet } from "./usageBilling";

const M = (v: string) => usdcToMicros(v)!;

/** The SolanaChain interface over LiteSVM: a refused transaction throws RejectedTransaction, as preflight does. */
function svmChain(svm: LiteSVM): SolanaChain & { landed: Set<string> } {
  const landed = new Set<string>();
  return {
    landed,
    async tokenAccount(address) {
      const a = svm.getAccount(address);
      if (!a) return null;
      const t = unpackAccount(address, { ...a, data: Buffer.from(a.data) }, TOKEN_PROGRAM_ID);
      return { amount: t.amount, delegate: t.delegate, delegatedAmount: t.delegatedAmount, isFrozen: t.isFrozen };
    },
    latestBlockhash: async () => ({ blockhash: svm.latestBlockhash(), lastValidBlockHeight: 1_000_000 }),
    async sendRaw(raw) {
      const tx = Transaction.from(raw);
      const r = svm.sendTransaction(tx);
      if (r instanceof FailedTransactionMetadata) throw new RejectedTransaction(`${r.err()} ${r.meta().logs().join(" | ")}`.slice(0, 500));
      const sig = bs58.encode(tx.signature!);
      landed.add(sig);
      svm.expireBlockhash(); // the next transaction gets a fresh blockhash, as on a real cluster
      return sig;
    },
    confirm: async (sig) => (landed.has(sig) ? { ok: true } : { ok: "unknown" }),
    status: async (sig) => (landed.has(sig) ? "confirmed" : null),
    blockHeight: async () => Number(svm.getClock().slot),
  };
}

function setup() {
  const svm = new LiteSVM();
  const sponsor = Keypair.generate();
  const agent = Keypair.generate(); // never funded with SOL
  const mint = Keypair.generate();
  svm.airdrop(sponsor.publicKey, BigInt(1_000_000_000));
  const send = (tx: Transaction, ...signers: Keypair[]) => {
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = sponsor.publicKey;
    tx.sign(sponsor, ...signers);
    const r = svm.sendTransaction(tx);
    if (r instanceof FailedTransactionMetadata) throw new Error(String(r.err()));
    svm.expireBlockhash();
  };
  // A 6-decimal token standing in for USDC, and 20 of it in the agent's USDC account.
  const agentUsdc = usdcAccountOf(agent.publicKey, mint.publicKey);
  send(
    new Transaction().add(
      SystemProgram.createAccount({ fromPubkey: sponsor.publicKey, newAccountPubkey: mint.publicKey, space: MINT_SIZE, lamports: 1_461_600 /* rent for an 82-byte mint */, programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(mint.publicKey, 6, sponsor.publicKey, null),
      createAssociatedTokenAccountInstruction(sponsor.publicKey, agentUsdc, agent.publicKey, mint.publicKey),
      createMintToInstruction(mint.publicKey, agentUsdc, sponsor.publicKey, Number(M("20"))),
    ),
    mint,
  );
  const status = billingConfig({ SOLANA_SPONSOR_SECRET_KEY: bs58.encode(sponsor.secretKey), SOLANA_USDC_MINT: mint.publicKey.toBase58() });
  if (!status.ready) throw new Error(status.missing.join());
  const cfg = status.config;
  const chain = svmChain(svm);
  const treasuryUsdc = usdcAccountOf(new PublicKey(DEFAULT_TREASURY), mint.publicKey);
  const balance = async (a: PublicKey) => (await chain.tokenAccount(a))?.amount ?? BigInt(0);

  /** The real approval flow: the sponsor builds and signs it, the agent co-signs, it's checked, then sent. */
  const approve = async (amount: string) => {
    const unsigned = buildApproveTransaction(cfg, agent.publicKey, M(amount), await chain.latestBlockhash());
    const tx = Transaction.from(Buffer.from(unsigned, "base64"));
    tx.partialSign(agent);
    const checked = checkSignedApproval(cfg, agent.publicKey, tx.serialize().toString("base64"));
    if (!checked.ok) throw new Error(checked.reason);
    return chain.sendRaw(checked.raw);
  };
  const store = memoryBillingStore({ w1: agent.publicKey.toBase58() });
  const use = async (amount: string) => store.recordUsage({ walletId: "w1", apiKeyId: null, endpoint: "GET /api/x402/catalog/search", amountMicros: M(amount) });
  return { svm, sponsor, agent, mint, cfg, chain, agentUsdc, treasuryUsdc, balance, approve, store, use, send };
}

describe("Solana billing on the real token programs (LiteSVM)", () => {
  it("an agent with no SOL approves; the sponsor pays the fees and settles exactly what's owed into the treasury", async () => {
    const t = setup();
    expect(t.svm.getAccount(t.agent.publicKey)).toBeNull(); // the agent holds no SOL at all
    expect(await canCharge(t.chain, t.cfg, t.agent.publicKey, BigInt(0), M("0.05"))).toMatchObject({ ok: false, error: "no_allowance" });

    const sponsorBefore = t.svm.getBalance(t.sponsor.publicKey)!;
    await t.approve("10");
    expect(t.svm.getAccount(t.agent.publicKey)).toBeNull(); // still no SOL: the sponsor paid
    expect(t.svm.getBalance(t.sponsor.publicKey)!).toBeLessThan(sponsorBefore);
    expect(await t.chain.tokenAccount(t.agentUsdc)).toMatchObject({ delegate: t.sponsor.publicKey, delegatedAmount: M("10"), amount: M("20") });
    expect(await canCharge(t.chain, t.cfg, t.agent.publicKey, BigInt(0), M("0.05"))).toEqual({ ok: true });

    // 101 searches at $0.05 = $5.05: past the $5 threshold.
    for (let i = 0; i < 101; i++) await t.use("0.05");
    const r = await settleWallet(t.store, t.chain, t.cfg, "w1", "threshold");
    expect(r).toMatchObject({ status: "confirmed", amountMicros: M("5.05") });
    expect(await t.balance(t.treasuryUsdc)).toBe(M("5.05")); // the treasury's USDC account was opened by the sponsor and paid
    expect(await t.chain.tokenAccount(t.agentUsdc)).toMatchObject({ amount: M("14.95"), delegatedAmount: M("4.95") });
    expect(await t.store.owed("w1")).toBe(BigInt(0));
    expect(t.svm.getAccount(t.agent.publicKey)).toBeNull(); // the agent never needed SOL

    // A second, smaller settlement (the daily run) reuses the treasury's account.
    await t.use("0.05");
    expect(await settleWallet(t.store, t.chain, t.cfg, "w1", "daily")).toMatchObject({ status: "confirmed", amountMicros: M("0.05") });
    expect(await t.balance(t.treasuryUsdc)).toBe(M("5.10"));
  });

  it("a revoked allowance: the transfer is refused, the settlement fails and the usage stays owed", async () => {
    const t = setup();
    await t.approve("10");
    t.send(new Transaction().add(createRevokeInstruction(t.agentUsdc, t.agent.publicKey)), t.agent);
    await t.use("0.05");
    const r = await settleWallet(t.store, t.chain, t.cfg, "w1", "daily");
    expect(r).toMatchObject({ status: "failed" });
    expect(await t.store.owed("w1")).toBe(M("0.05"));
    expect(await t.balance(t.treasuryUsdc)).toBe(BigInt(0));
    expect(await canCharge(t.chain, t.cfg, t.agent.publicKey, M("0.05"), M("0.05"))).toMatchObject({ ok: false, error: "no_allowance" });
  });

  it("the sponsor can never pull more than the agent approved", async () => {
    const t = setup();
    await t.approve("1");
    await t.use("1.05");
    expect(await settleWallet(t.store, t.chain, t.cfg, "w1", "daily")).toMatchObject({ status: "failed" });
    expect(await t.chain.tokenAccount(t.agentUsdc)).toMatchObject({ amount: M("20"), delegatedAmount: M("1") });
    expect(await canCharge(t.chain, t.cfg, t.agent.publicKey, M("1.05"), M("0.05"))).toMatchObject({ ok: false, error: "allowance_too_low" });
  });
});
