// A facilitator verifies and settles payments. Two implementations share one
// interface, so the route and the domain code never know which is in use:
//   mock — fully verifies the signed authorization off-chain, moves no funds.
//   http — a real x402 facilitator (POST /verify, POST /settle): the free
//          testnet one at https://x402.org/facilitator, or Coinbase's (CDP) for
//          Base mainnet, which signs each request with an API key. It submits
//          the USDC transfer on-chain and pays the gas.

import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { createPublicClient, erc20Abi, formatUnits, http, keccak256, toHex } from "viem";
import { z } from "zod";
import { USDC, USDC_DECIMALS, type PaymentPayload, type PaymentRequirements, type SettleResponse } from "./protocol";
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
export class FacilitatorUnavailableError extends Error {
  /** Set when the transfer was broadcast but its confirmation wasn't seen. */
  readonly transaction?: string;
  constructor(message: string, transaction?: string) {
    super(message);
    this.transaction = transaction;
  }
}

/** Extra headers for one facilitator request, e.g. an API token. */
export type FacilitatorAuth = (method: "POST", url: URL) => Promise<Record<string, string>>;

/** Coinbase Developer Platform: a short-lived JWT, signed with the API key and bound to this exact request. */
export function cdpAuth(apiKeyId: string, apiKeySecret: string): FacilitatorAuth {
  return async (method, url) => {
    const jwt = await generateJwt({ apiKeyId, apiKeySecret, requestMethod: method, requestHost: url.host, requestPath: url.pathname });
    return { Authorization: `Bearer ${jwt}` };
  };
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

/** A wallet's USDC balance in atomic units, or undefined when it can't be read. */
export type UsdcBalanceReader = (network: string, wallet: `0x${string}`) => Promise<bigint | undefined>;

export const readUsdcBalance: UsdcBalanceReader = async (network, wallet) => {
  const usdc = USDC[network];
  if (!usdc) return undefined;
  try {
    const client = createPublicClient({ transport: http(usdc.rpcUrl, { timeout: 5_000, retryCount: 0 }) });
    return await client.readContract({ address: usdc.address, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  } catch {
    return undefined;
  }
};

export const INSUFFICIENT_FUNDS = "insufficient_funds";
const usdcAmount = (atomic: bigint) => formatUnits(atomic, USDC_DECIMALS);

const VERIFY_TIMEOUT_MS = 10_000;
const SETTLE_TIMEOUT_MS = 30_000; // waits for the transfer to land on-chain
// Coinbase: broadcast but not confirmed in time. Resending the identical request re-checks that same
// transaction instead of sending a second one, so it's safe to ask once more.
const SETTLEMENT_PENDING = "settlement_pending";

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

async function post(url: string, body: unknown, timeoutMs: number, auth?: FacilitatorAuth): Promise<unknown> {
  let authHeaders: Record<string, string> = {};
  try {
    if (auth) authHeaders = await auth("POST", new URL(url));
  } catch (e) {
    throw new FacilitatorUnavailableError(`couldn't sign the request to ${url}: ${e instanceof Error ? e.message : e}`);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
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

export function httpFacilitator(
  baseUrl: string,
  auth?: FacilitatorAuth,
  { usdcBalance = readUsdcBalance }: { usdcBalance?: UsdcBalanceReader } = {},
): Facilitator {
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
      const parsed = VerifyResponseSchema.safeParse(await post(`${url}/verify`, body(payment, req), VERIFY_TIMEOUT_MS, auth));
      if (!parsed.success) throw new FacilitatorUnavailableError(`${url}/verify gave an unexpected response`);
      if (!parsed.data.isValid) {
        // Facilitators word an empty wallet differently (Coinbase: a generic "invalid_payload" from its
        // on-chain dry run), so check the balance ourselves and say it plainly.
        const balance = await usdcBalance(req.network, local.payer);
        if (balance !== undefined && balance < BigInt(req.amount)) {
          const network = USDC[req.network]?.label ?? req.network;
          return {
            isValid: false,
            invalidReason: INSUFFICIENT_FUNDS,
            invalidMessage:
              `Insufficient funds: wallet ${local.payer} holds ${usdcAmount(balance)} USDC on ${network}, but this request ` +
              `costs ${usdcAmount(BigInt(req.amount))} USDC. Add USDC on ${network} to that wallet and sign a new payment. You were not charged.`,
          };
        }
        return { isValid: false, invalidReason: parsed.data.invalidReason ?? "facilitator_rejected" };
      }
      return local;
    },
    async settle(payment, req, payer) {
      const attempt = async () => {
        const parsed = SettleResponseSchema.safeParse(await post(`${url}/settle`, body(payment, req), SETTLE_TIMEOUT_MS, auth));
        if (!parsed.success) throw new FacilitatorUnavailableError(`${url}/settle gave an unexpected response`);
        return parsed.data;
      };
      const pending = (r: z.infer<typeof SettleResponseSchema>) => !r.success && r.errorReason === SETTLEMENT_PENDING;

      let s = await attempt();
      if (pending(s)) s = await attempt();
      if (pending(s)) throw new FacilitatorUnavailableError(`${url}/settle is still pending`, s.transaction || undefined);
      return { ...s, payer: s.payer ?? payer, amount: s.amount ?? req.amount };
    },
  };
}
