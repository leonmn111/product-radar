import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/env", () => ({ env: {} })); // payment config isn't read by these checks
const { formatSiweMessage, siwxChallenge, verifySiwx, SIWX_MAX_AGE_MS } = await import("./siwx");

// Fixed throwaway test keys: never hold funds.
const wallet = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const stranger = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const NETWORK = "eip155:84532";
const url = new URL("https://theproductradar.io/api/agent/v2/dossier/B0CH33F5P2");
const NOW = new Date("2026-10-16T12:00:00.000Z");

/** What an x402 client does: take the challenge's info, add its chain, sign the EIP-4361 text. */
async function signIn(over: { signer?: typeof wallet; at?: URL; issuedAt?: Date; info?: Record<string, unknown> } = {}) {
  const challenge = siwxChallenge(over.at ?? url, NETWORK, over.issuedAt ?? NOW);
  const fields = { ...challenge.info, ...over.info, address: wallet.address, chainId: NETWORK };
  const signature = await (over.signer ?? wallet).signMessage({ message: formatSiweMessage(fields as never) });
  return Buffer.from(JSON.stringify({ ...fields, type: "eip191", signature })).toString("base64");
}

describe("formatSiweMessage", () => {
  it("matches an independent EIP-4361 implementation (viem) byte for byte", () => {
    const info = siwxChallenge(url, NETWORK, NOW).info;
    const ours = formatSiweMessage({ ...info, address: wallet.address, chainId: NETWORK });
    const viems = createSiweMessage({
      ...info,
      address: wallet.address,
      chainId: 84532,
      issuedAt: new Date(info.issuedAt),
      expirationTime: new Date(info.expirationTime),
    });
    expect(ours).toBe(viems);
    // And without a statement (the spec's two blank lines).
    const bare = { ...info, statement: undefined, nonce: generateSiweNonce() };
    expect(formatSiweMessage({ ...bare, address: wallet.address, chainId: NETWORK })).toBe(
      createSiweMessage({ ...bare, address: wallet.address, chainId: 84532, issuedAt: new Date(info.issuedAt), expirationTime: new Date(info.expirationTime) }),
    );
  });
});

describe("siwxChallenge", () => {
  it("binds the challenge to this site and path, on the payment network, for 5 minutes", () => {
    const c = siwxChallenge(new URL(`${url}?utm=x`), NETWORK, NOW);
    expect(c.info).toMatchObject({ domain: "theproductradar.io", uri: url.toString(), version: "1", issuedAt: NOW.toISOString(), resources: [url.toString()] });
    expect(new Date(c.info.expirationTime).getTime() - NOW.getTime()).toBe(SIWX_MAX_AGE_MS);
    expect(c.info.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(c.supportedChains).toEqual([{ chainId: NETWORK, type: "eip191" }]);
  });
});

describe("verifySiwx", () => {
  const check = async (header: string, at: URL = url, now: Date = NOW) => verifySiwx(header, { url: at, network: NETWORK }, now);

  it("accepts a fresh proof for this path and names the wallet", async () => {
    const result = await check(await signIn());
    expect(result).toMatchObject({ ok: true, address: wallet.address });
  });

  it.each([
    ["signed by another wallet", { signer: stranger }, "invalid_siwx_signature"],
    ["for another site", { at: new URL("https://evil.example/api/agent/v2/dossier/B0CH33F5P2") }, "invalid_siwx_domain_mismatch"],
    ["for another Dossier", { at: new URL("https://theproductradar.io/api/agent/v2/dossier/B0AAAAAAAA") }, "invalid_siwx_uri_mismatch"],
    ["older than 5 minutes", { issuedAt: new Date(NOW.getTime() - SIWX_MAX_AGE_MS - 1000) }, "invalid_siwx_issued_at_too_old"],
    ["issued in the future", { issuedAt: new Date(NOW.getTime() + 5 * 60_000) }, "invalid_siwx_issued_at_in_future"],
    ["already expired", { info: { expirationTime: new Date(NOW.getTime() - 1).toISOString() } }, "invalid_siwx_expired"],
  ])("rejects a proof %s", async (_label, over, reason) => {
    expect(await check(await signIn(over as never))).toEqual({ ok: false, reason });
  });

  it("rejects a proof altered after signing, a wrong chain, and a malformed header", async () => {
    const decoded = JSON.parse(Buffer.from(await signIn(), "base64").toString("utf8"));
    const reencode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
    expect(await check(reencode({ ...decoded, address: stranger.address }))).toEqual({ ok: false, reason: "invalid_siwx_signature" });
    expect(await check(reencode({ ...decoded, chainId: "eip155:8453" }))).toEqual({ ok: false, reason: "invalid_siwx_unsupported_chain" });
    expect(await check("not base64!")).toEqual({ ok: false, reason: "invalid_siwx_header" });
    expect(await check(reencode({ ...decoded, chainId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" }))).toEqual({ ok: false, reason: "invalid_siwx_header" });
  });
});
