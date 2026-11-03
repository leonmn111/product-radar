import { describe, expect, it } from "vitest";
import { authenticateAgent, issueApiKey, MAX_API_KEYS, requestNonce, verifySignIn, type WalletStore, type WalletView } from "./agentWallets";
import { testWallet } from "./testWallet";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
const SITE = { domain: "theproductradar.io", uri: "https://theproductradar.io" };
const AUTH = { secret: "test-secret-at-least-thirty-two-characters-long", issuer: "https://theproductradar.io" };

/** The WalletStore contract in memory. */
function memoryStore(): WalletStore {
  type Row = { nonce: string | null; issuedAt: Date | null; verifiedAt: Date | null };
  const wallets = new Map<string, Row>();
  const keys = new Map<string, { id: string; address: string; hash: string; prefix: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }>();
  let n = 0;
  return {
    async issueNonce(address, nonce, issuedAt) {
      wallets.set(address, { ...(wallets.get(address) ?? { verifiedAt: null }), nonce, issuedAt });
    },
    async pendingNonce(address) {
      const w = wallets.get(address);
      return w?.nonce && w.issuedAt ? { nonce: w.nonce, issuedAt: w.issuedAt } : null;
    },
    async consumeNonce(address, nonce, now) {
      const w = wallets.get(address);
      if (!w || w.nonce !== nonce) return false;
      Object.assign(w, { nonce: null, issuedAt: null, verifiedAt: w.verifiedAt ?? now });
      return true;
    },
    async wallet(address): Promise<WalletView | null> {
      const w = wallets.get(address);
      if (!w?.verifiedAt) return null;
      const active = [...keys.values()].filter((k) => k.address === address && !k.revokedAt);
      return {
        address,
        usdcBalance: "0.000000",
        verifiedAt: w.verifiedAt.toISOString(),
        apiKeys: active.map((k) => ({ id: k.id, prefix: k.prefix, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null })),
      };
    },
    async addKey(address, hash, prefix, max) {
      if (!wallets.get(address)?.verifiedAt) return null;
      if ([...keys.values()].filter((k) => k.address === address && !k.revokedAt).length >= max) return "too_many";
      const k = { id: `key-${++n}`, address, hash, prefix, createdAt: NOW, lastUsedAt: null, revokedAt: null };
      keys.set(hash, k);
      return { id: k.id, createdAt: k.createdAt };
    },
    async revokeKey(address, id, now) {
      const k = [...keys.values()].find((x) => x.id === id && x.address === address && !x.revokedAt);
      if (k) k.revokedAt = now;
      return Boolean(k);
    },
    async walletForKey(hash, now) {
      const k = keys.get(hash);
      if (!k || k.revokedAt) return null;
      k.lastUsedAt = now;
      return k.address;
    },
  };
}

async function signIn(store: WalletStore, w = testWallet(), at = NOW) {
  const nonce = await requestNonce(store, w.address, SITE, at);
  if (!nonce.ok) throw new Error(nonce.message);
  const signature = Buffer.from(w.sign(nonce.message)).toString("base64");
  return { w, nonce, signature, result: await verifySignIn(store, { address: w.address, signature }, SITE, AUTH, later(10_000)) };
}

describe("agent wallet sign-in", () => {
  it("nonce → signed message → session token → API key → the key works until it's revoked", async () => {
    const store = memoryStore();
    const { w, nonce, result } = await signIn(store);
    expect(nonce.message).toContain(`Nonce: ${nonce.nonce}`);
    expect(result).toMatchObject({ ok: true, tokenType: "Bearer", expiresIn: 3600, address: w.address });
    if (!result.ok) return;

    expect(await authenticateAgent(store, `Bearer ${result.token}`, AUTH, later(60_000))).toEqual({ address: w.address, via: "session" });
    const key = await issueApiKey(store, w.address);
    expect(key).toMatchObject({ ok: true, apiKey: expect.stringMatching(/^pr_agent_/) });
    if (!key.ok) return;
    expect(await authenticateAgent(store, `Bearer ${key.apiKey}`, AUTH, later(60_000))).toEqual({ address: w.address, via: "api_key" });
    expect((await store.wallet(w.address))?.apiKeys).toEqual([{ id: key.id, prefix: key.prefix, createdAt: key.createdAt, lastUsedAt: later(60_000).toISOString() }]);

    expect(await store.revokeKey(w.address, key.id, later(120_000))).toBe(true);
    expect(await authenticateAgent(store, `Bearer ${key.apiKey}`, AUTH, later(180_000))).toBeNull();
  });

  it("uses a nonce once: the same signature can't sign in twice", async () => {
    const store = memoryStore();
    const { w, signature } = await signIn(store);
    expect(await verifySignIn(store, { address: w.address, signature }, SITE, AUTH, later(20_000))).toMatchObject({ ok: false, status: 400, error: "no_nonce" });
  });

  it("refuses an expired nonce, another wallet's signature, and a message for another site", async () => {
    const store = memoryStore();
    const w = testWallet();
    const n = await requestNonce(store, w.address, SITE, NOW);
    if (!n.ok) throw new Error();
    const good = Buffer.from(w.sign(n.message)).toString("base64");
    expect(await verifySignIn(store, { address: w.address, signature: good }, SITE, AUTH, later(5 * 60_000 + 1))).toMatchObject({ status: 410, error: "nonce_expired" });

    const n2 = await requestNonce(store, w.address, SITE, NOW);
    if (!n2.ok) throw new Error();
    const intruder = Buffer.from(testWallet().sign(n2.message)).toString("base64");
    expect(await verifySignIn(store, { address: w.address, signature: intruder }, SITE, AUTH, later(1_000))).toMatchObject({ status: 401, error: "bad_signature" });
    const elsewhere = Buffer.from(w.sign(n2.message.replace("theproductradar.io wants", "evil.example wants"))).toString("base64");
    expect(await verifySignIn(store, { address: w.address, signature: elsewhere }, SITE, AUTH, later(1_000))).toMatchObject({ status: 401 });
    // The nonce wasn't spent by the failures, so the real signature still works.
    const real = Buffer.from(w.sign(n2.message)).toString("base64");
    expect(await verifySignIn(store, { address: w.address, signature: real }, SITE, AUTH, later(1_000))).toMatchObject({ ok: true });
  });

  it("checks the inputs", async () => {
    const store = memoryStore();
    expect(await requestNonce(store, "0xefee98996f9da31536765b43b19a7d0fea70d3d7", SITE, NOW)).toMatchObject({ status: 400, error: "invalid_address" });
    const w = testWallet();
    expect(await verifySignIn(store, { address: w.address, signature: "nope" }, SITE, AUTH, NOW)).toMatchObject({ status: 400, error: "invalid_signature" });
    const sig = Buffer.from(w.sign("x")).toString("base64");
    expect(await verifySignIn(store, { address: w.address, signature: sig }, SITE, AUTH, NOW)).toMatchObject({ status: 400, error: "no_nonce" });
  });

  it("limits active keys per wallet, and won't issue one to a wallet that never signed in", async () => {
    const store = memoryStore();
    const { w } = await signIn(store);
    for (let i = 0; i < MAX_API_KEYS; i++) expect((await issueApiKey(store, w.address)).ok).toBe(true);
    expect(await issueApiKey(store, w.address)).toMatchObject({ status: 409, error: "too_many_keys" });
    expect(await issueApiKey(store, testWallet().address)).toMatchObject({ status: 404, error: "unknown_wallet" });
  });

  it("knows nobody without a valid Bearer token", async () => {
    const store = memoryStore();
    for (const h of [null, "", "Basic abc", "Bearer ", "Bearer pr_agent_unknown", "Bearer not.a.jwt"]) expect(await authenticateAgent(store, h, AUTH, NOW)).toBeNull();
  });
});
