// x402 v2 wire format (HTTP transport), matching @x402/core 2.x:
//   402 response  → header PAYMENT-REQUIRED  = base64(JSON PaymentRequired)
//   paid request  → header PAYMENT-SIGNATURE = base64(JSON PaymentPayload)
//   paid response → header PAYMENT-RESPONSE  = base64(JSON SettleResponse)
// Only the "exact" scheme on EVM (EIP-3009 transferWithAuthorization, USDC) is supported.

import { z } from "zod";

export const X402_VERSION = 2;
export const HEADER_REQUIRED = "PAYMENT-REQUIRED";
export const HEADER_SIGNATURE = "PAYMENT-SIGNATURE";
export const HEADER_RESPONSE = "PAYMENT-RESPONSE";

/** Supported networks: CAIP-2 id → USDC deployment (EIP-712 domain). */
export const USDC: Record<
  string,
  { chainId: number; address: `0x${string}`; name: string; version: string; label: string; testnet: boolean }
> = {
  "eip155:84532": {
    chainId: 84532,
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    name: "USDC",
    version: "2",
    label: "Base Sepolia",
    testnet: true,
  },
  "eip155:8453": {
    chainId: 8453,
    address: "0x833589fCD6eDb6E08f4c3C32D4f71b54bdA02913",
    name: "USD Coin",
    version: "2",
    label: "Base",
    testnet: false,
  },
};
export const USDC_DECIMALS = 6;

export const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type ResourceInfo = { url: string; description?: string; mimeType?: string; serviceName?: string };

export type PaymentRequirements = {
  scheme: "exact";
  network: string;
  asset: string;
  amount: string; // atomic units
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
};

export type PaymentRequired = {
  x402Version: number;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
};

export type SettleResponse = {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction: string;
  network: string;
  amount?: string;
  extra?: Record<string, unknown>;
};

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "invalid address");
const uintString = z.string().regex(/^\d{1,78}$/, "invalid integer");

export const PaymentPayloadSchema = z.object({
  x402Version: z.number().int(),
  resource: z.object({ url: z.string() }).passthrough().optional(),
  accepted: z.object({
    scheme: z.string(),
    network: z.string(),
    asset: z.string(),
    amount: z.string(),
    payTo: z.string(),
    maxTimeoutSeconds: z.number(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
  payload: z.object({
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "invalid signature"),
    authorization: z.object({
      from: address,
      to: address,
      value: uintString,
      validAfter: uintString,
      validBefore: uintString,
      nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "invalid nonce"),
    }),
  }),
});
export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;

export const encodeHeader = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");

/** The 402 challenge: sent as the response body and, base64-encoded, as PAYMENT-REQUIRED. */
export function paymentRequiredBody(resource: ResourceInfo, requirements: PaymentRequirements, error?: string): PaymentRequired {
  return { x402Version: X402_VERSION, ...(error ? { error } : {}), resource, accepts: [requirements] };
}

export function decodePaymentSignature(header: string): PaymentPayload {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(header) || header.length > 16_384) throw new Error("malformed header");
  return PaymentPayloadSchema.parse(JSON.parse(Buffer.from(header, "base64").toString("utf8")));
}

/** "0.01" USDC → "10000" atomic units, without floating point. */
export function usdcToAtomic(amount: string): string {
  const [whole, frac = ""] = amount.split(".");
  return (BigInt(whole) * BigInt(10) ** BigInt(USDC_DECIMALS) + BigInt(frac.padEnd(USDC_DECIMALS, "0"))).toString();
}
