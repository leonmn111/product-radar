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
import { loadPaymentConfig } from "./config";
import { HEADER_REQUIRED, HEADER_RESPONSE, X402_VERSION, type PaymentRequirements } from "./protocol";

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

/**
 * The v2 prices in USDC (ROADMAP.md, pricing), the one place they're set. A search spends at least one
 * Rainforest credit (about $0.046 on the Hobbyist plan) plus an AliExpress call, so it's priced at $0.05,
 * not the $0.01 it launched at (2026-10-23).
 */
export const SEARCH_PRICE_USDC = "0.05";
export const DOSSIER_PRICE_USDC = "2.00";

/** The paid endpoints that exist today. Each future price tier is added here when its endpoint ships. */
export const BAZAAR: BazaarEndpoint[] = [
  {
    method: "GET",
    path: "/api/agent/v2/search",
    priceUsdc: SEARCH_PRICE_USDC,
    scheme: "exact",
    description: "8-part product Dossier for a search: verdict, resellability, landed margin, momentum, saturation, supplier matches, evidence, exports",
  },
  {
    method: "GET",
    path: "/api/agent/v2/dossier/:asin",
    priceUsdc: DOSSIER_PRICE_USDC,
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

// ── The bazaar manifest (GET /api/agent/v2/bazaar) ───────────────────────────────────────────────
// The x402 Bazaar discovery format (@x402/extensions 2.28, bazaar: DiscoveryResourcesResponse):
// one item per paid endpoint, with its live payment terms (`accepts`, the same as its 402) and a
// `bazaar` extension describing its input and output, so an agent knows when and how to call it.

/** What every ProductRadar Dossier is, in words an LLM can act on. */
export const DOSSIER_CAPABILITIES =
  "An 8-part product Dossier for UK resellers: 1 Verdict (LAUNCH / TEST / AVOID, shown from 0.5 confidence); " +
  "2 Resellability (brand-direct seller, trademark risk, UKCA/CE marking, cosmetics and battery rules); " +
  "3 Landed margin (UK and EU: supplier cost, VAT, duty, platform fees, net profit, ROI, break-even ad cost; from 0.7 confidence); " +
  "4 Momentum (12-week sales-rank trend: ACCELERATING / FLAT / DECELERATING, price trend, sales velocity); " +
  "5 Saturation (sellers and stores for the same product); 6 Supplier matches (top 3 AliExpress / 1688 listings); " +
  "7 Evidence (every source, time and quality score behind each number); 8 Exports (Shopify product CSV). " +
  "Parts without enough evidence are withheld and say what's missing; nothing is estimated.";

/** When the endpoints or their terms last changed. */
export const BAZAAR_UPDATED = "2026-10-23T00:00:00.000Z";

type ManifestEndpoint = {
  path: string;
  priceUsdc: string;
  description: string;
  tags: string[];
  /** Example values, as the bazaar's `info.input` shows them. */
  input: { queryParams?: Record<string, string>; pathParams?: Record<string, string> };
  /** The JSON Schema of each parameter, for the extension's `schema`. */
  params: { queryParams?: Record<string, unknown>; pathParams?: Record<string, unknown> };
  required: { queryParams?: string[]; pathParams?: string[] };
  example: unknown;
  extraExtensions?: Record<string, unknown>;
};

const MANIFEST: ManifestEndpoint[] = [
  {
    path: "/api/agent/v2/search",
    priceUsdc: SEARCH_PRICE_USDC,
    description: `Search Amazon UK for a product idea and get the Dossier for the product most listings agree on. Call it to answer "is this worth selling in the UK?" from a keyword. ${DOSSIER_CAPABILITIES}`,
    tags: ["ecommerce", "amazon-uk", "product-research", "dropshipping", "margins"],
    input: { queryParams: { q: "ceramic coffee mug" } },
    params: { queryParams: { q: { type: "string", minLength: 2, maxLength: 120, description: "What to search for" } } },
    required: { queryParams: ["q"] },
    example: { id: "<64 hex>", product: { title: "…", market: "UK", identifiers: { asin: "B0…" } }, verdict: { status: "shown", value: { kind: "TEST", label: "Test small", gate: null, reasons: ["…"] } } },
  },
  {
    path: "/api/agent/v2/dossier/:asin",
    priceUsdc: DOSSIER_PRICE_USDC,
    description: `The Standard Dossier for one Amazon UK product (by ASIN): its product page, other listings of it, supplier matches and 12-week momentum. Call it once a product is chosen, before ordering stock. A wallet that bought it reopens it free with Sign-In-With-X, and downloads its Shopify CSV at /export/csv. ${DOSSIER_CAPABILITIES}`,
    tags: ["ecommerce", "amazon-uk", "product-research", "supplier-sourcing", "margins"],
    input: { pathParams: { asin: "B0CH33F5P2" } },
    params: { pathParams: { asin: { type: "string", pattern: "^[A-Z0-9]{10}$", description: "Amazon UK ASIN" } } },
    required: { pathParams: ["asin"] },
    example: { id: "<64 hex>", product: { identifiers: { asin: "B0CH33F5P2" } }, landedMargin: { status: "shown", value: { uk: { netProfit: { amount: 5.63, currency: "GBP" } } } } },
    extraExtensions: { "sign-in-with-x": { purpose: "free reopening of a Dossier this wallet bought" } },
  },
];

function bazaarExtension(e: ManifestEndpoint) {
  const param = (props?: Record<string, unknown>, required?: string[]) =>
    props ? { type: "object", properties: props, ...(required?.length ? { required } : {}), additionalProperties: false } : undefined;
  const queryParams = param(e.params.queryParams, e.required.queryParams);
  const pathParams = param(e.params.pathParams, e.required.pathParams);
  return {
    info: { input: { type: "http", method: "GET", ...e.input }, output: { type: "json", example: e.example } },
    ...(e.path.includes(":") ? { routeTemplate: e.path } : {}),
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        input: {
          type: "object",
          properties: {
            type: { type: "string", const: "http" },
            method: { type: "string", enum: ["GET"] },
            ...(queryParams ? { queryParams } : {}),
            ...(pathParams ? { pathParams } : {}),
          },
          required: ["type", "method"],
          additionalProperties: false,
        },
        output: { type: "object", properties: { type: { type: "string" }, example: {} } },
      },
      required: ["input"],
    },
  };
}

export type DiscoveryResource = {
  resource: string;
  type: "http";
  x402Version: number;
  accepts: PaymentRequirements[];
  lastUpdated: string;
  description: string;
  mimeType: string;
  serviceName: string;
  tags: string[];
  extensions: Record<string, unknown>;
};

/** The manifest for this site: every paid endpoint with its live terms. `accepts` is empty while payments are off. */
export function bazaarManifest(origin: string) {
  const items: DiscoveryResource[] = MANIFEST.map((e) => {
    const config = loadPaymentConfig(e.priceUsdc);
    return {
      resource: `${origin}${e.path}`,
      type: "http",
      x402Version: X402_VERSION,
      accepts: config.ok ? [config.requirements] : [],
      lastUpdated: BAZAAR_UPDATED,
      description: e.description,
      mimeType: "application/json",
      serviceName: "ProductRadar",
      tags: e.tags,
      extensions: { bazaar: bazaarExtension(e), ...(e.extraExtensions ?? {}) },
    };
  });
  return { x402Version: X402_VERSION, items, pagination: { limit: items.length, offset: 0, total: items.length } };
}
