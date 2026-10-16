// Fiat plans for humans (x402 serves agents): credit packs and the v2 Pro subscription, as Stripe
// Checkout sessions. Billing module only. Pure: builds Stripe parameters and reads finished sessions;
// the Stripe client and the database are used elsewhere (checkout.ts, webhook.ts).
//
// Prices are set inline (price_data), so nothing has to be created in the Stripe dashboard first.

import type Stripe from "stripe";

export type CreditPackId = "starter" | "growth" | "scale";
export type CheckoutTier = CreditPackId | "pro";

export type CreditPack = { id: CreditPackId; name: string; pricePence: number; credits: number };

/** One-off packs of platform credits (ARCHITECTURE.md › Monetization). */
export const CREDIT_PACKS: Record<CreditPackId, CreditPack> = {
  starter: { id: "starter", name: "Starter Pack", pricePence: 1000, credits: 20 },
  growth: { id: "growth", name: "Growth Pack", pricePence: 2500, credits: 55 },
  scale: { id: "scale", name: "Scale Pack", pricePence: 5000, credits: 120 },
};

/**
 * The v2 Pro subscription. Its allowances are recorded here and enforced when credits are spent
 * (not built yet). The v1 Pro plan (£39/month, stripe.ts › PRO_PLAN) is a separate, live price.
 */
export const PRO_SUBSCRIPTION = {
  id: "pro",
  name: "Pro Subscription",
  pricePence: 2900,
  interval: "month",
  monthlyFreeSearches: 100,
  standardDossierCredits: 1, // what a Standard Dossier costs a Pro subscriber
} as const;

export const CHECKOUT_TIERS: readonly CheckoutTier[] = ["starter", "growth", "scale", "pro"];
const CURRENCY = "gbp";
const KIND = "credit_pack";

/** The Checkout Session for a tier: one-off payment for a pack, a monthly subscription for Pro. */
export function checkoutSessionParams(
  tier: CheckoutTier,
  ctx: { userId: string; customerId: string; baseUrl: string },
): Stripe.Checkout.SessionCreateParams {
  const common = {
    customer: ctx.customerId,
    client_reference_id: ctx.userId,
    cancel_url: `${ctx.baseUrl}/account?checkout=cancelled`,
  } as const;

  if (tier === "pro") {
    return {
      ...common,
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: PRO_SUBSCRIPTION.pricePence,
            recurring: { interval: PRO_SUBSCRIPTION.interval },
            product_data: {
              name: `ProductRadar ${PRO_SUBSCRIPTION.name}`,
              description: `${PRO_SUBSCRIPTION.monthlyFreeSearches} free searches a month; a Standard Dossier costs ${PRO_SUBSCRIPTION.standardDossierCredits} credit.`,
            },
          },
        },
      ],
      subscription_data: { metadata: { userId: ctx.userId, plan: "pro_v2" } },
      success_url: `${ctx.baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    };
  }

  const pack = CREDIT_PACKS[tier];
  return {
    ...common,
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: pack.pricePence,
          product_data: { name: `ProductRadar ${pack.name}`, description: `${pack.credits} platform credits.` },
        },
      },
    ],
    metadata: { kind: KIND, pack: pack.id, credits: String(pack.credits), userId: ctx.userId },
    payment_intent_data: { metadata: { kind: KIND, pack: pack.id, userId: ctx.userId } },
    success_url: `${ctx.baseUrl}/account?checkout=credits`,
  };
}

export type CreditGrant = { userId: string; packId: CreditPackId; credits: number; sessionId: string };

/**
 * The credits a finished Checkout Session pays for, or null with the reason it pays for none. The
 * pack, amount and currency must match the catalogue (the credit count always comes from the
 * catalogue, never from the session), and the payment must have gone through.
 */
export function creditGrantFor(session: Stripe.Checkout.Session): { grant: CreditGrant } | { grant: null; reason: string } {
  const meta = session.metadata ?? {};
  if (session.mode !== "payment" || meta.kind !== KIND) return { grant: null, reason: "not_a_credit_pack" };
  if (session.payment_status !== "paid") return { grant: null, reason: "not_paid" };
  const packId = meta.pack ?? "";
  if (!Object.hasOwn(CREDIT_PACKS, packId)) return { grant: null, reason: "unknown_pack" };
  const pack = CREDIT_PACKS[packId as CreditPackId];
  if (session.amount_total !== pack.pricePence || session.currency !== CURRENCY) return { grant: null, reason: "amount_mismatch" };
  const userId = session.client_reference_id ?? meta.userId;
  if (!userId) return { grant: null, reason: "no_user" };
  return { grant: { userId, packId: pack.id, credits: pack.credits, sessionId: session.id } };
}
