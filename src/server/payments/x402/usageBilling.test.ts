import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { billingConfig, RejectedTransaction, usdcToMicros, type BillingConfig, type ConfirmResult, type SolanaChain } from "./solanaBilling";
import { memoryBillingStore as memoryStore } from "./testBillingStore";
import { reachedThreshold, reconcile, settleAll, settleWallet, STALE_PENDING_MS } from "./usageBilling";

const M = (v: string) => usdcToMicros(v)!;
const s = billingConfig({ SOLANA_SPONSOR_SECRET_KEY: bs58.encode(Keypair.generate().secretKey) });
if (!s.ready) throw new Error("config");
const CFG: BillingConfig = s.config;
const NOW = new Date("2026-11-05T03:00:00.000Z");

/** A chain whose answers each test chooses. */
function fakeChain(o: { send?: () => Promise<string>; confirm?: ConfirmResult; status?: "confirmed" | { failed: string } | null; height?: number } = {}) {
  const sent: Buffer[] = [];
  const chain: SolanaChain & { sent: Buffer[] } = {
    sent,
    tokenAccount: async () => null,
    latestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 500 }),
    sendRaw: async (raw) => (sent.push(raw), o.send ? o.send() : "sig"),
    confirm: async () => o.confirm ?? { ok: true },
    status: async () => o.status ?? null,
    blockHeight: async () => o.height ?? 400,
  };
  return chain;
}

const agent = Keypair.generate().publicKey.toBase58();
const withUsage = async (...amounts: string[]) => {
  const store = memoryStore({ w1: agent });
  for (const a of amounts) await store.recordUsage({ walletId: "w1", apiKeyId: null, endpoint: "GET /api/x402/catalog/search", amountMicros: M(a) });
  return store;
};

describe("settleWallet", () => {
  it("pulls all unsettled usage in one transfer and confirms it", async () => {
    const store = await withUsage("0.05", "0.05", "0.05");
    const chain = fakeChain();
    const r = await settleWallet(store, chain, CFG, "w1", "daily", () => NOW);
    expect(r).toMatchObject({ status: "confirmed", amountMicros: M("0.15") });
    expect(chain.sent).toHaveLength(1);
    expect(store.settlements[0]).toMatchObject({ status: "CONFIRMED", amount: M("0.15") });
    expect(await store.owed("w1")).toBe(BigInt(0));
    expect(await settleWallet(store, chain, CFG, "w1", "daily")).toEqual({ status: "nothing" });
  });

  it("releases the usage when the network refuses the transfer (e.g. the allowance was revoked), so it's still owed", async () => {
    const store = await withUsage("0.05");
    const r = await settleWallet(store, fakeChain({ send: async () => Promise.reject(new RejectedTransaction("insufficient funds")) }), CFG, "w1", "daily");
    expect(r).toMatchObject({ status: "failed" });
    expect(store.settlements[0].status).toBe("FAILED");
    expect(await store.owed("w1")).toBe(M("0.05"));
    expect(await store.walletsWithUnsettled()).toEqual(["w1"]);
  });

  it("never releases usage when it can't tell whether the transfer landed: it stays in flight, signature recorded", async () => {
    const store = await withUsage("0.05");
    const lost = await settleWallet(store, fakeChain({ send: async () => Promise.reject(new Error("socket hang up")) }), CFG, "w1", "daily");
    expect(lost).toMatchObject({ status: "pending" });
    expect(store.settlements[0]).toMatchObject({ status: "SUBMITTED", signature: expect.any(String) });
    // Nothing else can be claimed for this wallet meanwhile: no double pull.
    await store.recordUsage({ walletId: "w1", apiKeyId: null, endpoint: "x", amountMicros: M("0.05") });
    expect(await settleWallet(store, fakeChain(), CFG, "w1", "threshold")).toEqual({ status: "nothing" });
    expect(await store.owed("w1")).toBe(M("0.10"));

    const slow = await withUsage("0.05");
    expect(await settleWallet(slow, fakeChain({ confirm: { ok: "unknown" } }), CFG, "w1", "daily")).toMatchObject({ status: "pending" });
  });

  it("fails and releases a transfer that ran but failed on the chain", async () => {
    const store = await withUsage("0.05");
    expect(await settleWallet(store, fakeChain({ confirm: { ok: false, error: "custom program error: 0x1" } }), CFG, "w1", "daily")).toMatchObject({ status: "failed" });
    expect(await store.owed("w1")).toBe(M("0.05"));
  });
});

describe("reconcile", () => {
  const pending = async () => {
    const store = await withUsage("0.05");
    await settleWallet(store, fakeChain({ confirm: { ok: "unknown" } }), CFG, "w1", "daily");
    return store;
  };

  it("confirms a transfer the chain has, fails one it refused, and waits for one that can still land", async () => {
    const a = await pending();
    expect(await reconcile(a, fakeChain({ status: "confirmed" }))).toEqual({ confirmed: 1, failed: 0, waiting: 0 });
    expect(await a.owed("w1")).toBe(BigInt(0));
    const b = await pending();
    expect(await reconcile(b, fakeChain({ status: { failed: "x" } }))).toEqual({ confirmed: 0, failed: 1, waiting: 0 });
    expect(await b.owed("w1")).toBe(M("0.05"));
    const c = await pending();
    expect(await reconcile(c, fakeChain({ status: null, height: 400 }))).toEqual({ confirmed: 0, failed: 0, waiting: 1 });
  });

  it("fails a transfer that's past its last valid block and was never seen, and one claimed but never sent", async () => {
    const a = await pending();
    expect(await reconcile(a, fakeChain({ status: null, height: 501 }))).toEqual({ confirmed: 0, failed: 1, waiting: 0 });
    const b = await withUsage("0.05");
    await b.claim("w1", "daily");
    expect(await reconcile(b, fakeChain(), () => NOW)).toEqual({ confirmed: 0, failed: 0, waiting: 1 });
    expect(await reconcile(b, fakeChain(), () => new Date(NOW.getTime() + STALE_PENDING_MS + 1))).toEqual({ confirmed: 0, failed: 1, waiting: 0 });
    expect(await b.owed("w1")).toBe(M("0.05"));
  });
});

describe("the daily run and the $5 threshold", () => {
  it("settles every wallet that owes anything, one transfer each", async () => {
    const store = memoryStore({ w1: agent, w2: Keypair.generate().publicKey.toBase58(), w3: Keypair.generate().publicKey.toBase58() });
    for (const [w, a] of [["w1", "0.05"], ["w2", "0.05"], ["w2", "0.05"]] as const) await store.recordUsage({ walletId: w, apiKeyId: null, endpoint: "x", amountMicros: M(a) });
    const chain = fakeChain();
    const { results } = await settleAll(store, chain, CFG);
    expect(results.map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
    expect(chain.sent).toHaveLength(2);
  });

  it("triggers at $5 unsettled, not before", () => {
    expect([reachedThreshold(M("4.95")), reachedThreshold(M("5")), reachedThreshold(M("5.05"))]).toEqual([false, true, true]);
  });
});
