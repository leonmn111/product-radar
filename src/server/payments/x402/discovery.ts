// x402 discovery headers on every response from a paid endpoint (payment code only, CLAUDE.md Rule 2):
//
//   x402-price               what this request costs in USDC ("0.00" when a wallet reopens a purchase)
//   x402-payment-identifier  a fresh 256-bit random id for this request; the Dossier carries it as its id,
//                            so a receipt, a log line and an answer can be matched. Replay protection is
//                            NOT this header: it's the signed payment's own nonce, which the middleware
//                            reserves exactly once in the database.
//   x402-bazaar              the paid endpoints this server offers, as JSON
//
// They sit alongside the standard x402 v2 headers (PAYMENT-REQUIRED / PAYMENT-SIGNATURE / PAYMENT-RESPONSE).

import { randomBytes } from "node:crypto";
import { HEADER_REQUIRED, HEADER_RESPONSE } from "./protocol";

export const HEADER_PRICE = "x402-price";
export const HEADER_PAYMENT_ID = "x402-payment-identifier";
export const HEADER_BAZAAR = "x402-bazaar";

export type BazaarEndpoint = {
  method: "GET";
  path: string;
  priceUsdc: string;
  scheme: "exact";
  description: string;
  extensions?: string[]; // x402 extensions the endpoint supports, e.g. "sign-in-with-x" (free reopening)
};

/** The paid endpoints that exist today. Each future price tier is added here when its endpoint ships. */
export const BAZAAR: BazaarEndpoint[] = [
  {
    method: "GET",
    path: "/api/agent/v2/search",
    priceUsdc: "0.01",
    scheme: "exact",
    description: "8-part product Dossier for a search: verdict, resellability, landed margin, momentum, saturation, supplier matches, evidence, exports",
  },
  {
    method: "GET",
    path: "/api/agent/v2/dossier/{asin}",
    priceUsdc: "2.00",
    scheme: "exact",
    description: "Standard Dossier for one Amazon UK product (ASIN): its product page, other listings of it and supplier matches. Reopen it free with Sign-In-With-X",
    extensions: ["sign-in-with-x"],
  },
];

/** 32 random bytes as hex: unique per request, unguessable. */
export const newPaymentIdentifier = () => randomBytes(32).toString("hex");

export function discoveryHeaders(priceUsdc: string, paymentIdentifier: string): Record<string, string> {
  return {
    [HEADER_PRICE]: priceUsdc,
    [HEADER_PAYMENT_ID]: paymentIdentifier,
    [HEADER_BAZAAR]: JSON.stringify(BAZAAR),
    "Access-Control-Expose-Headers": [HEADER_REQUIRED, HEADER_RESPONSE, HEADER_PRICE, HEADER_PAYMENT_ID, HEADER_BAZAAR].join(", "),
  };
}

/** The same response with the discovery headers added. */
export function withDiscoveryHeaders(response: Response, priceUsdc: string, paymentIdentifier: string): Response {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(discoveryHeaders(priceUsdc, paymentIdentifier))) out.headers.set(k, v);
  return out;
}
