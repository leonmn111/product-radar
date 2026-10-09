// A facilitator verifies and settles payments. Two implementations share one
// interface, so the route and the domain code never know which is in use:
//   mock — fully verifies the signed authorization off-chain, moves no funds.
//   http — a real x402 facilitator (POST /verify, POST /settle), e.g. the free
//          testnet one at https://x402.org/facilitator. It submits the USDC
//          transfer on-chain and pays the gas.

import { keccak256, toHex } from "viem";
import { z } from "zod";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "./protocol";
import { verifyExactEvmPayment, type VerifyResult } from "./verify";

export interface Facilitator {
  readonly kind: "mock" | "http";
  verify(payment: PaymentPayload, req: PaymentRequirements, nowSeconds: number): Promise<VerifyResult>;
  settle(payment: PaymentPayload, req: PaymentRequirements, payer: string): Promise<SettleResponse>;
}

/**
 * The facilitator could not be reached or gave an answer we can't read. Unlike
 * a rejected payment, this says nothing about whether the payment is valid.
 */
export class FacilitatorUnavailableError extends Error {}

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

const VERIFY_TIMEOUT_MS = 10_000;
const SETTLE_TIMEOUT_MS = 30_000; // waits for the transfer to land on-chain

const VerifyResponseSchema = z.object({
  isValid: z.boolean(),
  invalidReason: z.string().optional(),
  payer: z.string().optional(),
});

const SettleResponseSchema = z.object({
  success: z.boolean(),
  errorReason: z.string().optional(),
  payer: z.string().optional(),
  transaction: z.string().default(""),
  network: z.string(),
  amount: z.string().optional(),
});

async function post(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new FacilitatorUnavailableError(`${url} unreachable: ${e instanceof Error ? e.message : e}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new FacilitatorUnavailableError(`${url} answered ${res.status} with non-JSON: ${text.slice(0, 200)}`);
  }
}

export function httpFacilitator(baseUrl: string): Facilitator {
  const url = baseUrl.replace(/\/+$/, "");
  const body = (payment: PaymentPayload, req: PaymentRequirements) => ({
    x402Version: payment.x402Version,
    paymentPayload: payment,
    paymentRequirements: req,
  });

  return {
    kind: "http",
    async verify(payment, req, nowSeconds) {
      // Local checks first: wrong, expired or forged payments never cost a network round-trip.
      const local = await verifyExactEvmPayment(payment, req, nowSeconds);
      if (!local.isValid) return local;

      // The facilitator adds what we can't check offline: balance and on-chain nonce state.
      const parsed = VerifyResponseSchema.safeParse(await post(`${url}/verify`, body(payment, req), VERIFY_TIMEOUT_MS));
      if (!parsed.success) throw new FacilitatorUnavailableError(`${url}/verify gave an unexpected response`);
      if (!parsed.data.isValid) return { isValid: false, invalidReason: parsed.data.invalidReason ?? "facilitator_rejected" };
      return local;
    },
    async settle(payment, req, payer) {
      const parsed = SettleResponseSchema.safeParse(await post(`${url}/settle`, body(payment, req), SETTLE_TIMEOUT_MS));
      if (!parsed.success) throw new FacilitatorUnavailableError(`${url}/settle gave an unexpected response`);
      const s = parsed.data;
      return { ...s, payer: s.payer ?? payer, amount: s.amount ?? req.amount };
    },
  };
}
