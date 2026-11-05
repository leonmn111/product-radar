import { decodeTransferCheckedInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import {
  billingConfig,
  buildApproveTransaction,
  buildSettlementTransaction,
  canCharge,
  checkSignedApproval,
  DEFAULT_TREASURY,
  USDC_MAINNET_MINT,
  usdc,
  usdcAccountOf,
  usdcToMicros,
  type BillingConfig,
  type SolanaChain,
  type TokenAccountState,
} from "./solanaBilling";

const sponsor = Keypair.generate();
const cfg = billingConfig({ SOLANA_SPONSOR_SECRET_KEY: bs58.encode(sponsor.secretKey) });
if (!cfg.ready) throw new Error("config");
const CFG: BillingConfig = cfg.config;
const recent = { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1_000 };
const M = (v: string) => usdcToMicros(v)!;

describe("money", () => {
  it("is integer micro-USDC, parsed and printed exactly", () => {
    expect([M("10"), M("0.05"), M("2.5"), M("0.000001")]).toEqual([BigInt(10_000_000), BigInt(50_000), BigInt(2_500_000), BigInt(1)]);
    for (const bad of ["-1", "1.0000001", "abc", "", "1e3"]) expect(usdcToMicros(bad)).toBeNull();
    expect([usdc(BigInt(50_000)), usdc(BigInt(5_000_000)), usdc(BigInt(0))]).toEqual(["0.050000", "5.000000", "0.000000"]);
  });
});

describe("billingConfig", () => {
  it("defaults to the owner's treasury and Circle's USDC, and is off without a sponsor key", () => {
    expect([CFG.treasury.toBase58(), CFG.mint.toBase58(), CFG.rpcUrl]).toEqual([DEFAULT_TREASURY, USDC_MAINNET_MINT, "https://api.mainnet-beta.solana.com"]);
    expect(DEFAULT_TREASURY).toBe("5nggd832fCRBSinVXdEHc1E6QR6DK8r2GfYycUDPtPgx"); // the directive's address
    expect(USDC_MAINNET_MINT).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Circle's USDC mint
    expect(billingConfig({})).toEqual({ ready: false, missing: ["SOLANA_SPONSOR_SECRET_KEY is not set"] });
    expect(billingConfig({ SOLANA_SPONSOR_SECRET_KEY: "nope" }).ready).toBe(false);
    const treasuryKey = Keypair.generate();
    expect(billingConfig({ SOLANA_SPONSOR_SECRET_KEY: bs58.encode(treasuryKey.secretKey), SOLANA_TREASURY: treasuryKey.publicKey.toBase58() })).toMatchObject({
      ready: false,
      missing: ["the sponsor wallet must not be the treasury"],
    });
  });
});

describe("the sponsored approval", () => {
  const agent = Keypair.generate();
  const signedBy = (kp: Keypair, b64: string) => {
    const tx = Transaction.from(Buffer.from(b64, "base64"));
    tx.partialSign(kp);
    return tx.serialize().toString("base64");
  };

  it("is paid for by the sponsor and, once the agent signs it, approves the sponsor on the agent's USDC account", () => {
    const unsigned = buildApproveTransaction(CFG, agent.publicKey, M("10"), recent);
    const tx = Transaction.from(Buffer.from(unsigned, "base64"));
    expect(tx.feePayer?.equals(sponsor.publicKey)).toBe(true);
    expect(checkSignedApproval(CFG, agent.publicKey, unsigned)).toMatchObject({ ok: false }); // the agent hasn't signed yet
    const ok = checkSignedApproval(CFG, agent.publicKey, signedBy(agent, unsigned));
    expect(ok).toMatchObject({ ok: true, amount: M("10") });
  });

  it("is never broadcast for another wallet, after tampering, or if it isn't ours", () => {
    const unsigned = buildApproveTransaction(CFG, agent.publicKey, M("10"), recent);
    const signed = signedBy(agent, unsigned);
    expect(checkSignedApproval(CFG, Keypair.generate().publicKey, signed)).toMatchObject({ ok: false });
    // Change one byte of the amount after both signed: both signatures break.
    const bytes = Buffer.from(signed, "base64");
    bytes[bytes.length - 3] ^= 1;
    expect(checkSignedApproval(CFG, agent.publicKey, bytes.toString("base64"))).toMatchObject({ ok: false });
    // A transaction the agent built itself with the sponsor as fee payer: no sponsor signature, so refused.
    const own = new Transaction({ feePayer: sponsor.publicKey, ...recent }).add(Transaction.from(Buffer.from(unsigned, "base64")).instructions[0]);
    own.partialSign(agent);
    expect(checkSignedApproval(CFG, agent.publicKey, own.serialize({ requireAllSignatures: false }).toString("base64"))).toMatchObject({ ok: false });
    expect(checkSignedApproval(CFG, agent.publicKey, "junk")).toMatchObject({ ok: false });
  });
});

describe("the settlement transfer", () => {
  it("moves exactly the amount from the agent's USDC account to the treasury's, with the sponsor as delegate and fee payer", () => {
    const agent = Keypair.generate().publicKey;
    const { raw, signature } = buildSettlementTransaction(CFG, agent, M("5.05"), recent);
    const tx = Transaction.from(raw);
    expect(tx.feePayer?.equals(sponsor.publicKey)).toBe(true);
    expect(bs58.encode(tx.signature!)).toBe(signature);
    expect(tx.verifySignatures()).toBe(true);
    const transfer = decodeTransferCheckedInstruction(tx.instructions.at(-1)!, TOKEN_PROGRAM_ID);
    expect(transfer.data).toMatchObject({ amount: M("5.05"), decimals: 6 });
    expect(transfer.keys.source.pubkey.equals(getAssociatedTokenAddressSync(CFG.mint, agent))).toBe(true);
    expect(transfer.keys.destination.pubkey.toBase58()).toBe("HCDTnS9x7cwi2C3RJ5doQQxyScYMyXY1cPFexQejbe4r"); // the treasury's USDC account on mainnet
    expect(transfer.keys.owner.pubkey.equals(sponsor.publicKey)).toBe(true);
  });
});

describe("canCharge", () => {
  const agent = Keypair.generate().publicKey;
  const chainWith = (acct: TokenAccountState | null) => ({ tokenAccount: async () => acct }) as unknown as SolanaChain;
  const approved = (allowance: string, held: string): TokenAccountState => ({ amount: M(held), delegate: sponsor.publicKey, delegatedAmount: M(allowance), isFrozen: false });

  it("charges when the allowance and the USDC cover what's owed plus this request", async () => {
    expect(await canCharge(chainWith(approved("10", "20")), CFG, agent, M("4.95"), M("0.05"))).toEqual({ ok: true });
  });

  it("asks for payment (402) otherwise, saying what's missing", async () => {
    const check = async (acct: TokenAccountState | null, owed = "0") => (await canCharge(chainWith(acct), CFG, agent, M(owed), M("0.05"))) as { error: string };
    expect((await check(null)).error).toBe("no_usdc_account");
    expect((await check({ ...approved("10", "10"), delegate: null })).error).toBe("no_allowance");
    expect((await check({ ...approved("10", "10"), delegate: Keypair.generate().publicKey })).error).toBe("no_allowance");
    expect((await check(approved("1", "10"), "0.99")).error).toBe("allowance_too_low");
    expect((await check(approved("10", "0.04"))).error).toBe("insufficient_usdc");
    expect((await check({ ...approved("10", "10"), isFrozen: true })).error).toBe("usdc_account_frozen");
  });

  it("reads the agent's own USDC account", async () => {
    let asked: PublicKey | null = null;
    await canCharge({ tokenAccount: async (a: PublicKey) => ((asked = a), null) } as unknown as SolanaChain, CFG, agent, BigInt(0), M("0.05"));
    expect(asked!.equals(usdcAccountOf(agent, CFG.mint))).toBe(true);
  });
});
