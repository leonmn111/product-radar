// HTTP 402 negotiation for route handlers (CLAUDE.md Rule 2: all payment
// logic lives here). Wrap a handler with withX402Payment() and it only runs
// after a valid payment; the handler itself never sees payment details.
//
//   SIGN-IN-WITH-X (routes that opt in): a wallet that already bought this exact path proves it
//                             → `reopen` serves the purchase again, free; nothing is verified or settled
//   no PAYMENT-SIGNATURE      → 402 + PAYMENT-REQUIRED (price, asset, payTo; the sign-in challenge)
//   invalid / replayed proof  → 402 + PAYMENT-REQUIRED with `error`
//   valid proof               → nonce locked → handler runs →
//        2xx: settle, record, 200 + PAYMENT-RESPONSE
//        non-2xx: nonce released, nothing charged, handler response returned
//   facilitator unreachable   → 503 before the handler runs (nothing charged), or
//                               502 at settlement (nonce stays locked: status unknown)

import { connection, type NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { loadPaymentConfig } from "./config";
import { FacilitatorUnavailableError } from "./facilitator";
import { HEADER_SIWX, paidReference, SIWX_EXTENSION, siwxChallenge, spendSiwxNonce, verifySiwx } from "./siwx";
import {
  decodePaymentSignature,
  encodeHeader,
  HEADER_REQUIRED,
  HEADER_RESPONSE,
  HEADER_SIGNATURE,
  paymentRequiredBody,
  type PaymentPayload,
  type PaymentRequirements,
  type ResourceInfo,
} from "./protocol";

const HEADERS_EXPOSED = `${HEADER_REQUIRED}, ${HEADER_RESPONSE}`;

type Challenge = { resource: ResourceInfo; requirements: PaymentRequirements; extensions?: Record<string, unknown> };

function paymentRequired({ resource, requirements, extensions }: Challenge, error?: string, message?: string) {
  const body = paymentRequiredBody(resource, requirements, error, extensions);
  // `message` is a human explanation for the JSON body only; the header stays the standard x402 shape.
  return Response.json(message ? { ...body, message } : body, {
    status: 402,
    headers: {
      [HEADER_REQUIRED]: encodeHeader(body),
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers": HEADERS_EXPOSED,
    },
  });
}

async function reserveNonce(payment: PaymentPayload, req: PaymentRequirements, payer: string, resourceUrl: URL, reference: string | undefined) {
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
        resource: resourceUrl.toString(),
        resourcePath: resourceUrl.pathname,
        reference: reference ?? null,
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

export type PaidRouteMeta = {
  description: string;
  mimeType?: string;
  priceUsdc?: string;
  /** What this request sells (e.g. the Dossier id), stored with the payment; Sign-In-With-X hands it back. */
  reference?: string;
  /**
   * Sign-In-With-X: a wallet that already paid for this exact path reopens its purchase for free.
   * `reopen` gets the purchase's reference and returns the response, or null if it can't (then the
   * caller is asked to pay as usual).
   */
  signInWithX?: { reopen: (reference: string, request: NextRequest) => Promise<Response | null> };
};

export function withX402Payment(meta: PaidRouteMeta, handler: (request: NextRequest) => Promise<Response>) {
  return async function paidHandler(request: NextRequest): Promise<Response> {
    await connection();
    const config = loadPaymentConfig(meta.priceUsdc);
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

    const challenge: Challenge = {
      resource,
      requirements,
      ...(meta.signInWithX ? { extensions: { [SIWX_EXTENSION]: siwxChallenge(request.nextUrl, requirements.network) } } : {}),
    };

    // A returning buyer first: a valid sign-in for a path this wallet already paid for is served free.
    let siwxError: string | undefined;
    const siwxHeader = meta.signInWithX ? request.headers.get(HEADER_SIWX) : null;
    if (meta.signInWithX && siwxHeader) {
      const proof = await verifySiwx(siwxHeader, { url: request.nextUrl, network: requirements.network });
      if (!proof.ok) siwxError = proof.reason;
      else {
        const reference = await paidReference(proof.address, request.nextUrl.pathname);
        if (!reference) siwxError = "siwx_no_purchase";
        else if (!(await spendSiwxNonce(proof.nonce, proof.address))) siwxError = "invalid_siwx_nonce";
        else {
          const reopened = await meta.signInWithX.reopen(reference, request);
          if (reopened) return reopened;
          siwxError = "siwx_purchase_unavailable";
        }
      }
    }

    const header = request.headers.get(HEADER_SIGNATURE);
    if (!header) return paymentRequired(challenge, siwxError);

    let payment: PaymentPayload;
    try {
      payment = decodePaymentSignature(header);
    } catch {
      return paymentRequired(challenge, "invalid_payment_header");
    }

    let verdict;
    try {
      verdict = await facilitator.verify(payment, requirements, Math.floor(Date.now() / 1000));
    } catch (e) {
      if (!(e instanceof FacilitatorUnavailableError)) throw e;
      console.error("[x402] verify failed", e.message);
      return Response.json(
        { error: "facilitator_unavailable", message: "Payment verification is temporarily unavailable. You were not charged; retry shortly." },
        { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } },
      );
    }
    if (!verdict.isValid) return paymentRequired(challenge, verdict.invalidReason, verdict.invalidMessage);

    if (!(await reserveNonce(payment, requirements, verdict.payer, request.nextUrl, meta.reference))) {
      return paymentRequired(challenge, "nonce_already_used");
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

    let settlement;
    try {
      settlement = await facilitator.settle(payment, requirements, verdict.payer);
    } catch (e) {
      if (!(e instanceof FacilitatorUnavailableError)) throw e;
      // The transfer may or may not have landed, so the nonce stays locked (status RESERVED):
      // this authorization can never buy a second response. Sign a fresh one to retry.
      console.error("[x402] settle status unknown", nonce, e.transaction ?? "", e.message);
      if (e.transaction) {
        // Broadcast but unconfirmed: keep the hash on the reserved row for reconciliation.
        await db.agentPayment
          .update({ where: { nonce: nonce.toLowerCase() }, data: { transaction: e.transaction } })
          .catch((err) => console.error("[x402] couldn't record pending transaction", nonce, err));
      }
      return Response.json(
        {
          error: "settlement_unknown",
          message: e.transaction
            ? "Your payment was sent to the network but not yet confirmed, so no data was returned. Check `transaction` on a block explorer before signing a new payment to retry."
            : "We couldn't confirm your payment with the facilitator, so no data was returned. Retry with a newly signed payment.",
          nonce,
          ...(e.transaction ? { transaction: e.transaction } : {}),
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!settlement.success) {
      await releaseNonce(nonce);
      return paymentRequired(challenge, settlement.errorReason ?? "settlement_failed");
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
