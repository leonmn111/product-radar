// HTTP 402 negotiation for route handlers (CLAUDE.md Rule 2: all payment
// logic lives here). Wrap a handler with withX402Payment() and it only runs
// after a valid payment; the handler itself never sees payment details.
//
//   no PAYMENT-SIGNATURE      → 402 + PAYMENT-REQUIRED (price, asset, payTo)
//   invalid / replayed proof  → 402 + PAYMENT-REQUIRED with `error`
//   valid proof               → nonce locked → handler runs →
//        2xx: settle, record, 200 + PAYMENT-RESPONSE
//        non-2xx: nonce released, nothing charged, handler response returned

import { connection, type NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { mockFacilitator, type Facilitator } from "./facilitator";
import {
  decodePaymentSignature,
  encodeHeader,
  HEADER_REQUIRED,
  HEADER_RESPONSE,
  HEADER_SIGNATURE,
  USDC,
  usdcToAtomic,
  X402_VERSION,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type ResourceInfo,
} from "./protocol";

const MOCK_NETWORK = "eip155:84532"; // Base Sepolia (testnet) — mock never advertises mainnet
const MAX_TIMEOUT_SECONDS = 120;

type Config =
  | { ok: true; facilitator: Facilitator; requirements: PaymentRequirements }
  | { ok: false; reason: string };

function loadConfig(): Config {
  if (env.X402_MODE !== "mock") return { ok: false, reason: "Agent payments are not enabled on this server." };
  if (env.NODE_ENV === "production") return { ok: false, reason: "Mock payments are disabled in production." };
  if (!env.X402_PAY_TO) return { ok: false, reason: "X402_PAY_TO is not configured." };
  const usdc = USDC[MOCK_NETWORK];
  return {
    ok: true,
    facilitator: mockFacilitator,
    requirements: {
      scheme: "exact",
      network: MOCK_NETWORK,
      asset: usdc.address,
      amount: usdcToAtomic(env.X402_PRICE_USDC),
      payTo: env.X402_PAY_TO,
      maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
      extra: { name: usdc.name, version: usdc.version },
    },
  };
}

const HEADERS_EXPOSED = `${HEADER_REQUIRED}, ${HEADER_RESPONSE}`;

function paymentRequired(resource: ResourceInfo, requirements: PaymentRequirements, error?: string) {
  const body: PaymentRequired = { x402Version: X402_VERSION, ...(error ? { error } : {}), resource, accepts: [requirements] };
  return Response.json(body, {
    status: 402,
    headers: {
      [HEADER_REQUIRED]: encodeHeader(body),
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers": HEADERS_EXPOSED,
    },
  });
}

async function reserveNonce(payment: PaymentPayload, req: PaymentRequirements, payer: string, resourceUrl: string) {
  const auth = payment.payload.authorization;
  try {
    await db.agentPayment.create({
      data: {
        nonce: auth.nonce.toLowerCase(),
        payer,
        payTo: req.payTo,
        network: req.network,
        asset: req.asset,
        amount: req.amount,
        resource: resourceUrl,
        validBefore: new Date(Number(auth.validBefore) * 1000),
      },
    });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false; // already used
    throw e;
  }
}

const releaseNonce = (nonce: string) =>
  db.agentPayment.deleteMany({ where: { nonce: nonce.toLowerCase(), status: "RESERVED" } });

export function withX402Payment(
  meta: { description: string; mimeType?: string },
  handler: (request: NextRequest) => Promise<Response>,
) {
  return async function paidHandler(request: NextRequest): Promise<Response> {
    await connection();
    const config = loadConfig();
    if (!config.ok) {
      return Response.json({ error: "payments_unavailable", message: config.reason }, { status: 503 });
    }
    const { facilitator, requirements } = config;
    const resource: ResourceInfo = {
      url: request.nextUrl.toString(),
      description: meta.description,
      mimeType: meta.mimeType ?? "application/json",
      serviceName: "ProductRadar",
    };

    const header = request.headers.get(HEADER_SIGNATURE);
    if (!header) return paymentRequired(resource, requirements);

    let payment: PaymentPayload;
    try {
      payment = decodePaymentSignature(header);
    } catch {
      return paymentRequired(resource, requirements, "invalid_payment_header");
    }

    const verdict = await facilitator.verify(payment, requirements, Math.floor(Date.now() / 1000));
    if (!verdict.isValid) return paymentRequired(resource, requirements, verdict.invalidReason);

    if (!(await reserveNonce(payment, requirements, verdict.payer, resource.url))) {
      return paymentRequired(resource, requirements, "nonce_already_used");
    }

    const nonce = payment.payload.authorization.nonce;
    let response: Response;
    try {
      response = await handler(request);
    } catch (e) {
      console.error("[x402] paid handler failed", e);
      await releaseNonce(nonce);
      return Response.json({ error: "internal_error", message: "The request failed and was not charged." }, { status: 500 });
    }
    if (!response.ok) {
      await releaseNonce(nonce); // the caller isn't charged for a failed request
      return response;
    }

    const settlement = await facilitator.settle(payment, requirements, verdict.payer);
    if (!settlement.success) {
      await releaseNonce(nonce);
      return paymentRequired(resource, requirements, settlement.errorReason ?? "settlement_failed");
    }
    await db.agentPayment.update({
      where: { nonce: nonce.toLowerCase() },
      data: { status: "SETTLED", transaction: settlement.transaction, settledAt: new Date() },
    });

    const paid = new Response(response.body, response);
    paid.headers.set(HEADER_RESPONSE, encodeHeader(settlement));
    paid.headers.set("Access-Control-Expose-Headers", HEADERS_EXPOSED);
    paid.headers.set("Cache-Control", "no-store");
    return paid;
  };
}
