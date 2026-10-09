import { generateKeyPairSync, verify as verifySignature } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdpAuth, FacilitatorUnavailableError, httpFacilitator } from "./facilitator";
import { EIP3009_TYPES, USDC, type PaymentRequirements } from "./protocol";

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("@/lib/env", () => ({ env }));
const { agentPaymentStatus, CDP_FACILITATOR_URL, loadPaymentConfig } = await import("./config");

// Fixed throwaway test key — never holds funds.
const payer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const usdc = USDC["eip155:84532"];
const NOW = 1_800_000_000;
const PAY_TO = "0x92bD141F0e64a10e8dcE1f40f0DaB65a5D402514";

const req: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  asset: usdc.address,
  amount: "10000",
  payTo: PAY_TO,
  maxTimeoutSeconds: 120,
  extra: { name: usdc.name, version: usdc.version },
};

async function signedPayment(value = req.amount) {
  const authorization = {
    from: payer.address,
    to: PAY_TO as `0x${string}`,
    value,
    validAfter: "0",
    validBefore: String(NOW + 60),
    nonce: `0x${"ab".repeat(32)}` as `0x${string}`,
  };
  const signature = await payer.signTypedData({
    domain: { name: usdc.name, version: usdc.version, chainId: usdc.chainId, verifyingContract: usdc.address },
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: { ...authorization, value: BigInt(value), validAfter: BigInt(0), validBefore: BigInt(NOW + 60) },
  });
  return { x402Version: 2, accepted: { ...req }, payload: { signature, authorization } };
}

const fetchMock = vi.fn<typeof fetch>();
const answer = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("HTTP facilitator", () => {
  const facilitator = httpFacilitator("https://facilitator.test/x402/");

  it("forwards a locally valid payment to /verify in the x402 v2 shape", async () => {
    answer(200, { isValid: true, payer: payer.address });
    const payment = await signedPayment();
    expect(await facilitator.verify(payment, req, NOW)).toEqual({ isValid: true, payer: payer.address });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://facilitator.test/x402/verify");
    expect(JSON.parse(init!.body as string)).toEqual({ x402Version: 2, paymentPayload: payment, paymentRequirements: req });
  });

  it("rejects bad payments locally without calling the facilitator", async () => {
    expect(await facilitator.verify(await signedPayment("1"), req, NOW)).toEqual({ isValid: false, invalidReason: "amount_mismatch" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes on the facilitator's rejection reason (e.g. an empty wallet)", async () => {
    answer(400, { isValid: false, invalidReason: "insufficient_funds" });
    expect(await facilitator.verify(await signedPayment(), req, NOW)).toEqual({ isValid: false, invalidReason: "insufficient_funds" });
  });

  it.each([
    ["is unreachable", () => fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))],
    ["answers with an HTML error page", () => answer(502, "<html>Bad gateway</html>")],
    ["answers JSON without a verdict", () => answer(500, { error: "boom" })],
  ])("treats a facilitator that %s as unavailable, not as a rejection", async (_label, arrange) => {
    arrange();
    await expect(facilitator.verify(await signedPayment(), req, NOW)).rejects.toBeInstanceOf(FacilitatorUnavailableError);
  });

  it("returns the on-chain transaction from /settle", async () => {
    answer(200, { success: true, transaction: "0xabc", network: "eip155:84532", payer: payer.address });
    const s = await facilitator.settle(await signedPayment(), req, payer.address);
    expect(s).toMatchObject({ success: true, transaction: "0xabc", network: "eip155:84532", payer: payer.address, amount: "10000" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://facilitator.test/x402/settle");
  });

  it("reports a definite settlement failure, and throws when the outcome is unknown", async () => {
    answer(400, { success: false, errorReason: "insufficient_funds", transaction: "", network: "eip155:84532" });
    expect(await facilitator.settle(await signedPayment(), req, payer.address)).toMatchObject({
      success: false,
      errorReason: "insufficient_funds",
    });

    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(facilitator.settle(await signedPayment(), req, payer.address)).rejects.toBeInstanceOf(FacilitatorUnavailableError);
  });
});

describe("Coinbase (CDP) facilitator", () => {
  // Throwaway Ed25519 key in CDP's format: base64(seed ‖ public key).
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), Buffer.from(jwk.x!, "base64url")]).toString("base64");
  const KEY_ID = "organizations/test-org/apiKeys/test-key";
  const facilitator = httpFacilitator(CDP_FACILITATOR_URL, cdpAuth(KEY_ID, secret));
  const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

  it("signs each request with a short-lived token bound to that exact endpoint", async () => {
    answer(200, { isValid: true, payer: payer.address });
    answer(200, { success: true, transaction: "0xabc", network: "eip155:84532" });
    const payment = await signedPayment();
    await facilitator.verify(payment, req, NOW);
    await facilitator.settle(payment, req, payer.address);

    for (const [i, path] of [[0, "verify"], [1, "settle"]] as const) {
      const [url, init] = fetchMock.mock.calls[i];
      expect(url).toBe(`https://api.cdp.coinbase.com/platform/v2/x402/${path}`);
      const [h, p, sig] = (init!.headers as Record<string, string>).Authorization.replace(/^Bearer /, "").split(".");
      expect(decode(h)).toMatchObject({ alg: "EdDSA", kid: KEY_ID });
      const claims = decode(p);
      expect(claims).toMatchObject({ iss: "cdp", sub: KEY_ID, uris: [`POST api.cdp.coinbase.com/platform/v2/x402/${path}`] });
      expect(claims.exp - claims.nbf).toBeLessThanOrEqual(120);
      expect(verifySignature(null, Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    }
  });

  it("treats a key it can't sign with as unavailable, without calling Coinbase", async () => {
    const broken = httpFacilitator(CDP_FACILITATOR_URL, cdpAuth(KEY_ID, "not-a-key"));
    await expect(broken.verify(await signedPayment(), req, NOW)).rejects.toBeInstanceOf(FacilitatorUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks once more while settlement is pending, then hands back the unconfirmed transaction", async () => {
    const pendingBody = { success: false, errorReason: "settlement_pending", transaction: "0xpending", network: "eip155:8453" };
    answer(500, pendingBody);
    answer(200, { success: true, transaction: "0xpending", network: "eip155:8453" });
    expect(await facilitator.settle(await signedPayment(), req, payer.address)).toMatchObject({ success: true, transaction: "0xpending" });
    expect(fetchMock.mock.calls[1][1]!.body).toBe(fetchMock.mock.calls[0][1]!.body); // the identical request, resent

    answer(500, pendingBody);
    answer(500, pendingBody);
    const error = await facilitator.settle(await signedPayment(), req, payer.address).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FacilitatorUnavailableError);
    expect((error as FacilitatorUnavailableError).transaction).toBe("0xpending");
    expect(fetchMock).toHaveBeenCalledTimes(4); // never more than one resend
  });
});

describe("payment config", () => {
  beforeEach(() => {
    for (const k of Object.keys(env)) delete env[k];
    Object.assign(env, { NODE_ENV: "production", X402_PAY_TO: PAY_TO, X402_PRICE_USDC: "0.02" });
  });

  it("is off unless a mode is set", () => {
    expect(loadPaymentConfig()).toEqual({ ok: false, reason: "Agent payments are not enabled on this server." });
    expect(agentPaymentStatus()).toMatchObject({
      enabled: false,
      testnet: true,
      priceUsdc: "0.02",
      requirements: { network: "eip155:84532", amount: "20000", payTo: PAY_TO },
    });
  });

  it("refuses mock payments in production", () => {
    env.X402_MODE = "mock";
    expect(loadPaymentConfig()).toMatchObject({ ok: false });
  });

  it("defaults the facilitator to the free testnet one on Base Sepolia", () => {
    env.X402_MODE = "facilitator";
    const config = loadPaymentConfig();
    expect(config.ok && config.facilitator.kind).toBe("http");
    expect(config.ok && config.requirements).toMatchObject({ network: "eip155:84532", asset: usdc.address, amount: "20000", payTo: PAY_TO });
    expect(agentPaymentStatus()).toMatchObject({ enabled: true, mock: false, testnet: true, networkLabel: "Base Sepolia" });
  });

  it("settles Base mainnet through Coinbase, which needs an API key", () => {
    Object.assign(env, { X402_MODE: "facilitator", X402_NETWORK: "eip155:8453" });
    expect(loadPaymentConfig()).toEqual({ ok: false, reason: "The Coinbase facilitator needs CDP_API_KEY_ID and CDP_API_KEY_SECRET." });

    Object.assign(env, { CDP_API_KEY_ID: "key-id", CDP_API_KEY_SECRET: "key-secret" });
    const config = loadPaymentConfig();
    expect(config.ok && config.requirements).toMatchObject({ network: "eip155:8453", asset: USDC["eip155:8453"].address, extra: { name: "USD Coin" } });
    expect(agentPaymentStatus()).toMatchObject({ enabled: true, testnet: false, networkLabel: "Base" });
  });

  it("won't settle mainnet through the testnet-only x402.org facilitator", () => {
    Object.assign(env, { X402_MODE: "facilitator", X402_NETWORK: "eip155:8453", X402_FACILITATOR_URL: "https://x402.org/facilitator/" });
    expect(loadPaymentConfig()).toMatchObject({ ok: false });

    env.X402_FACILITATOR_URL = "https://mainnet-facilitator.test";
    expect(loadPaymentConfig()).toMatchObject({ ok: true });
  });

  it("needs a wallet to pay into", () => {
    Object.assign(env, { X402_MODE: "facilitator", X402_PAY_TO: undefined });
    expect(loadPaymentConfig()).toEqual({ ok: false, reason: "X402_PAY_TO is not configured." });
  });
});
