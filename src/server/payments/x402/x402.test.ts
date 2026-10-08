import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { decodePaymentSignature, EIP3009_TYPES, encodeHeader, USDC, usdcToAtomic, type PaymentRequirements } from "./protocol";
import { verifyExactEvmPayment } from "./verify";

// Fixed throwaway test keys — never hold funds.
const payer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const stranger = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const usdc = USDC["eip155:84532"];
const NOW = 1_800_000_000;

const req: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  asset: usdc.address,
  amount: "10000",
  payTo: "0x92bD141F0e64a10e8dcE1f40f0DaB65a5D402514",
  maxTimeoutSeconds: 120,
  extra: { name: usdc.name, version: usdc.version },
};

async function signedPayment(over: { value?: string; to?: string; validBefore?: number; validAfter?: number; signer?: typeof payer; nonce?: string } = {}) {
  const signer = over.signer ?? payer;
  const authorization = {
    from: payer.address,
    to: (over.to ?? req.payTo) as `0x${string}`,
    value: over.value ?? req.amount,
    validAfter: String(over.validAfter ?? 0),
    validBefore: String(over.validBefore ?? NOW + 60),
    nonce: (over.nonce ?? `0x${"ab".repeat(32)}`) as `0x${string}`,
  };
  const signature = await signer.signTypedData({
    domain: { name: usdc.name, version: usdc.version, chainId: usdc.chainId, verifyingContract: usdc.address },
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      ...authorization,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
    },
  });
  return { x402Version: 2, accepted: { ...req }, payload: { signature, authorization } };
}

describe("x402 exact-EVM verification", () => {
  it("accepts a correctly signed authorization and identifies the payer", async () => {
    const result = await verifyExactEvmPayment(await signedPayment(), req, NOW);
    expect(result).toEqual({ isValid: true, payer: payer.address });
  });

  it("round-trips through the PAYMENT-SIGNATURE header encoding", async () => {
    const p = await signedPayment();
    expect(decodePaymentSignature(encodeHeader(p))).toEqual(p);
    expect(() => decodePaymentSignature("not base64!")).toThrow();
  });

  it.each([
    ["underpaying", { value: "1" }, "amount_mismatch"],
    ["paying someone else", { to: stranger.address }, "recipient_mismatch"],
    ["an expired authorization", { validBefore: NOW + 2 }, "authorization_expired"],
    ["a not-yet-valid authorization", { validAfter: NOW + 30 }, "authorization_not_yet_valid"],
    ["an authorization valid for days", { validBefore: NOW + 86_400 }, "authorization_validity_too_long"],
    ["a signature from a different wallet", { signer: stranger }, "invalid_signature"],
  ])("rejects %s", async (_label, over, reason) => {
    const result = await verifyExactEvmPayment(await signedPayment(over), req, NOW);
    expect(result).toEqual({ isValid: false, invalidReason: reason });
  });

  it("rejects a payload altered after signing", async () => {
    const p = await signedPayment();
    p.payload.authorization.nonce = `0x${"cd".repeat(32)}` as `0x${string}`;
    expect(await verifyExactEvmPayment(p, req, NOW)).toEqual({ isValid: false, invalidReason: "invalid_signature" });
  });

  it("rejects when the client claims different requirements than offered", async () => {
    const p = await signedPayment();
    p.accepted.amount = "1";
    expect(await verifyExactEvmPayment(p, req, NOW)).toEqual({ isValid: false, invalidReason: "accepted_requirements_mismatch" });
  });

  it("converts USDC prices to atomic units without floating point", () => {
    expect(usdcToAtomic("0.01")).toBe("10000");
    expect(usdcToAtomic("1")).toBe("1000000");
    expect(usdcToAtomic("12.345678")).toBe("12345678");
  });
});
