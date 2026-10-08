// A facilitator verifies and settles payments. Today only the mock exists:
// it fully verifies the signed authorization off-chain but does not move
// funds. A real facilitator (e.g. Coinbase's /verify + /settle) can be added
// behind this same interface without touching the route or the domain code.

import { keccak256, toHex } from "viem";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "./protocol";
import { verifyExactEvmPayment, type VerifyResult } from "./verify";

export interface Facilitator {
  readonly kind: "mock";
  verify(payment: PaymentPayload, req: PaymentRequirements, nowSeconds: number): Promise<VerifyResult>;
  settle(payment: PaymentPayload, req: PaymentRequirements, payer: string): Promise<SettleResponse>;
}

export const mockFacilitator: Facilitator = {
  kind: "mock",
  verify: verifyExactEvmPayment,
  async settle(payment, req, payer) {
    // Deterministic, clearly-labelled fake reference — never a real transaction hash.
    const ref = keccak256(toHex(`mock-settlement:${payment.payload.authorization.nonce}`));
    return {
      success: true,
      payer,
      transaction: `mock:${ref}`,
      network: req.network,
      amount: req.amount,
      extra: { mock: true, note: "Signature verified; no funds were transferred." },
    };
  },
};
