// Off-chain verification of an x402 "exact" EVM payment (EIP-3009). Pure: no
// database, no network. Checks everything a facilitator checks before
// settlement except the payer's on-chain balance.

import { getAddress, verifyTypedData } from "viem";
import { EIP3009_TYPES, USDC, X402_VERSION, type PaymentPayload, type PaymentRequirements } from "./protocol";

/** A facilitator needs a few seconds to settle before the authorization expires. */
const MIN_VALIDITY_SECONDS = 6;

export type VerifyResult =
  | { isValid: true; payer: `0x${string}` }
  | { isValid: false; invalidReason: string; invalidMessage?: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function verifyExactEvmPayment(
  payment: PaymentPayload,
  req: PaymentRequirements,
  nowSeconds: number,
): Promise<VerifyResult> {
  const fail = (invalidReason: string): VerifyResult => ({ isValid: false, invalidReason });
  const { accepted, payload } = payment;
  const auth = payload.authorization;

  if (payment.x402Version !== X402_VERSION) return fail("unsupported_x402_version");
  if (accepted.scheme !== req.scheme || accepted.network !== req.network) return fail("unsupported_scheme_or_network");
  if (!same(accepted.asset, req.asset) || !same(accepted.payTo, req.payTo) || accepted.amount !== req.amount) {
    return fail("accepted_requirements_mismatch");
  }

  const usdc = USDC[req.network];
  if (!usdc || !same(usdc.address, req.asset)) return fail("unsupported_asset");
  if (!same(auth.to, req.payTo)) return fail("recipient_mismatch");
  if (BigInt(auth.value) !== BigInt(req.amount)) return fail("amount_mismatch");

  const validAfter = BigInt(auth.validAfter);
  const validBefore = BigInt(auth.validBefore);
  const now = BigInt(nowSeconds);
  if (validAfter > now) return fail("authorization_not_yet_valid");
  if (validBefore < now + BigInt(MIN_VALIDITY_SECONDS)) return fail("authorization_expired");
  if (validBefore > now + BigInt(req.maxTimeoutSeconds + 60)) return fail("authorization_validity_too_long");

  let signatureOk = false;
  try {
    signatureOk = await verifyTypedData({
      address: getAddress(auth.from),
      domain: { name: usdc.name, version: usdc.version, chainId: usdc.chainId, verifyingContract: usdc.address },
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: getAddress(auth.from),
        to: getAddress(auth.to),
        value: BigInt(auth.value),
        validAfter,
        validBefore,
        nonce: auth.nonce as `0x${string}`,
      },
      signature: payload.signature as `0x${string}`,
    });
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return fail("invalid_signature");

  return { isValid: true, payer: getAddress(auth.from) };
}
