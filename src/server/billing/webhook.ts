// Verifies and applies Stripe webhook events. Billing module only.
// Kept free of `server-only`/env imports so it can be tested directly.

import Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma/client";
import { UnknownUserError, type CreditStore } from "./credits";
import { creditGrantFor, planGrantFor, type CreditGrant, type PlanGrant } from "./plans";
import { applySubscription, snapshotFromStripe, type ApplyResult } from "./subscription";

export class InvalidSignatureError extends Error {}

export function verifyStripeEvent(rawBody: string, signature: string | null, secret: string): Stripe.Event {
  if (!signature) throw new InvalidSignatureError("Missing Stripe-Signature header.");
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (e) {
    throw new InvalidSignatureError(e instanceof Error ? e.message : "Invalid signature.");
  }
}

export type HandledEvent = { type: string; result: ApplyResult | "linked" | "credited" | "already_credited" | "ignored"; reason?: string };

export type WebhookHooks = {
  /** After a pack is credited for the first time (never on a repeat delivery), e.g. to send the receipt. */
  onCredited?: (grant: CreditGrant) => Promise<void>;
  /** After a plan's monthly credits are granted for an invoice (once per invoice), e.g. the renewal email. */
  onPlanCredited?: (grant: PlanGrant, user: { id: string; email: string; balance: number }) => Promise<void>;
};

/**
 * `credits` receives paid credit packs (the database ledger, credits.ts). A failing `onCredited`
 * (e.g. the receipt email) is logged; it doesn't fail the event, since the credits are already in.
 */
export async function handleStripeEvent(db: PrismaClient, event: Stripe.Event, credits?: CreditStore, hooks: WebhookHooks = {}): Promise<HandledEvent> {
  const eventTime = new Date(event.created * 1000);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return { type: event.type, result: await applySubscription(db, snapshotFromStripe(event.data.object), eventTime) };

    case "checkout.session.completed": {
      const s = event.data.object;
      // A credit pack: credit the buyer once per session, for exactly what the catalogue says.
      if (s.mode === "payment") {
        const found = creditGrantFor(s);
        if (!found.grant || !credits) return { type: event.type, result: "ignored", reason: found.grant ? "no_credit_store" : found.reason };
        try {
          const credited = await credits.grant(found.grant);
          if (credited && hooks.onCredited) {
            await hooks.onCredited(found.grant).catch((e) => console.error("[billing] after-credit step failed (credits are in)", s.id, e));
          }
          return { type: event.type, result: credited ? "credited" : "already_credited" };
        } catch (e) {
          if (!(e instanceof UnknownUserError)) throw e; // Stripe retries
          // Paid, but the account is gone: retrying can't help. Logged loudly for a manual refund.
          console.error("[billing] PAID credit pack for a missing user: refund it in Stripe", s.id, found.grant.userId);
          return { type: event.type, result: "ignored", reason: "unknown_user" };
        }
      }
      // A subscription: normally the customer is linked when checkout starts; this covers
      // customers created by Stripe itself (e.g. a payment link).
      const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id;
      if (s.mode !== "subscription" || !s.client_reference_id || !customerId) return { type: event.type, result: "ignored" };
      const { count } = await db.user.updateMany({
        where: { id: s.client_reference_id, stripeCustomerId: null },
        data: { stripeCustomerId: customerId },
      });
      return { type: event.type, result: count ? "linked" : "ignored" };
    }

    case "invoice.payment_succeeded": {
      // A plan's monthly credits (Agency: 500), once per paid subscription invoice.
      const found = planGrantFor(event.data.object);
      if (!found.grant || !credits) return { type: event.type, result: "ignored", reason: found.grant ? "no_credit_store" : found.reason };
      const user = await db.user.findUnique({ where: { stripeCustomerId: found.grant.customerId }, select: { id: true, email: true } });
      if (!user) {
        // Paid, but no account has this Stripe customer: retrying can't help. Logged for a manual fix.
        console.error("[billing] PAID plan invoice for an unknown customer: grant the credits by hand", event.data.object.id, found.grant.customerId);
        return { type: event.type, result: "ignored", reason: "unknown_customer" };
      }
      const { granted, balance } = await credits.grantPlanCredits(user.id, found.grant);
      if (granted && hooks.onPlanCredited) {
        await hooks.onPlanCredited(found.grant, { id: user.id, email: user.email, balance }).catch((e) =>
          console.error("[billing] after-grant step failed (credits are in)", found.grant.invoiceId, e),
        );
      }
      return { type: event.type, result: granted ? "credited" : "already_credited" };
    }

    default:
      return { type: event.type, result: "ignored" };
  }
}
