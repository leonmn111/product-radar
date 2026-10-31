// Fiat plans for humans (x402 serves agents): credit packs and the two subscriptions, Pro £29 and
// Agency £149 a month (the only plans; the old £39 Pro is gone), as Stripe Checkout sessions. Billing module only. Pure: builds Stripe parameters and reads finished sessions;
// the Stripe client and the database are used elsewhere (checkout.ts, webhook.ts).
//
// Prices are set inline (price_data), so nothing has to be created in the Stripe dashboard first.

import type Stripe from "stripe";
import type { SubscriptionTier } from "@/generated/prisma/enums";

export type CreditPackId = "starter" | "growth" | "scale";
export type PlanId = "pro" | "agency";
export type CheckoutTier = CreditPackId | PlanId;

/** 1 credit = £0.50. Credits are the ledger's unit only: the site shows every balance and price in £ (CMA). */
export const CREDIT_VALUE_PENCE = 50;

/** "£2" or "£0.50": pence as the site shows a price (pennies only when there are some). */
export const gbp = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: pence % 100 === 0 ? 0 : 2 }).format(pence / 100);

/** A price held in credits, in £: 4 credits → "£2". */
export const creditsGbp = (credits: number) => gbp(credits * CREDIT_VALUE_PENCE);

/** A balance held in credits, in £ with pennies: 4 credits → "£2.00". */
export const balanceGbp = (credits: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((credits * CREDIT_VALUE_PENCE) / 100);

export type CreditPack = { id: CreditPackId; name: string; pricePence: number; credits: number };

/** One-off packs of platform credits (ARCHITECTURE.md › Monetization). */
export const CREDIT_PACKS: Record<CreditPackId, CreditPack> = {
  starter: { id: "starter", name: "Starter Pack", pricePence: 1000, credits: 20 },
  growth: { id: "growth", name: "Growth Pack", pricePence: 2500, credits: 55 },
  scale: { id: "scale", name: "Scale Pack", pricePence: 5000, credits: 120 },
};

export type Plan = {
  id: PlanId;
  tier: Exclude<SubscriptionTier, "FREE">;
  name: string;
  pricePence: number;
  interval: "month";
  description: string;
  /** Allowances each month. Recorded here; granting and counting them isn't built yet (ROADMAP.md › Open items). */
  monthly: { freeSearches?: number; credits?: number };
};

/**
 * The subscriptions (owner, 2026-10-16). Pro: 100 free searches a month, a Standard Dossier for 1 credit.
 * Agency: 500 credits a month, a Standard Dossier for 1 credit, and later a bulk CSV endpoint.
 */
export const PLANS: Record<PlanId, Plan> = {
  pro: {
    id: "pro",
    tier: "PRO",
    name: "Pro",
    pricePence: 2900,
    interval: "month",
    description: "100 free searches a month; a Standard Dossier costs £0.50 from your balance.",
    monthly: { freeSearches: 100 },
  },
  agency: {
    id: "agency",
    tier: "AGENCY",
    name: "Agency",
    pricePence: 14900,
    interval: "month",
    description: "£250 of balance a month; a Standard Dossier costs £0.50 from it.",
    monthly: { credits: 500 },
  },
};

/** "£29/month": a plan's price as the site shows it. */
export const planPriceLabel = (plan: Plan) =>
  `${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0 }).format(plan.pricePence / 100)}/${plan.interval}`;

/** What a Standard Dossier costs in credits: 4 (£2.00) without a plan, 1 on Pro or Agency. */
export const STANDARD_DOSSIER_CREDITS: Record<SubscriptionTier, number> = { FREE: 4, PRO: 1, AGENCY: 1 };

export const CHECKOUT_TIERS: readonly CheckoutTier[] = ["starter", "growth", "scale", "pro", "agency"];
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

  if (tier === "pro" || tier === "agency") {
    const plan = PLANS[tier];
    return {
      ...common,
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: plan.pricePence,
            recurring: { interval: plan.interval },
            product_data: { name: `ProductRadar ${plan.name}`, description: plan.description },
          },
        },
      ],
      allow_promotion_codes: true,
      subscription_data: { metadata: { userId: ctx.userId, plan: plan.id } },
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
          product_data: { name: `ProductRadar ${pack.name}`, description: `${balanceGbp(pack.credits)} of ProductRadar balance.` },
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

// ── Monthly plan credits (Agency) ────────────────────────────────────────────

/** Invoices that start or renew a subscription period; others (plan changes, manual) grant nothing. */
const PERIOD_INVOICES = new Set(["subscription_create", "subscription_cycle", "subscription"]);

export type PlanGrant = {
  planId: PlanId;
  credits: number;
  invoiceId: string;
  customerId: string;
  amountPaid: number; // minor units
  currency: string; // ISO, upper case
  periodStart: Date | null;
  periodEnd: Date | null;
  invoiceNumber: string | null;
  firstPeriod: boolean; // the subscription's first invoice, not a renewal
};

/**
 * The monthly credits a paid subscription invoice brings, or null with the reason it brings none.
 * The plan is the one our checkout tagged the subscription with (Stripe snapshots the subscription's
 * metadata onto each invoice); an untagged invoice counts as Agency only by its £149 subscription line.
 * The credit count always comes from the catalogue.
 */
export function planGrantFor(invoice: Stripe.Invoice): { grant: PlanGrant } | { grant: null; reason: string } {
  if (!PERIOD_INVOICES.has(invoice.billing_reason ?? "")) return { grant: null, reason: "not_a_period_invoice" };
  if (invoice.status !== "paid") return { grant: null, reason: "not_paid" };
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId || !invoice.id) return { grant: null, reason: "no_customer" };
  const tagged = invoice.parent?.subscription_details?.metadata?.plan;
  const lines = invoice.lines?.data ?? [];
  const agencyLine = lines.some((l) => l.amount === PLANS.agency.pricePence && l.parent?.type === "subscription_item_details");
  const planId: PlanId | null = tagged === "agency" ? "agency" : tagged === "pro" ? "pro" : agencyLine && invoice.currency === CURRENCY ? "agency" : null;
  if (!planId) return { grant: null, reason: "unknown_plan" };
  const credits = PLANS[planId].monthly.credits ?? 0;
  if (credits <= 0) return { grant: null, reason: "plan_has_no_monthly_credits" };
  const period = lines[0]?.period;
  return {
    grant: {
      planId,
      credits,
      invoiceId: invoice.id,
      customerId,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency.toUpperCase(),
      periodStart: period?.start ? new Date(period.start * 1000) : null,
      periodEnd: period?.end ? new Date(period.end * 1000) : null,
      invoiceNumber: invoice.number,
      firstPeriod: invoice.billing_reason === "subscription_create",
    },
  };
}

// ── The £29 Pre-order Check (one product, no account) ────────────────────────

const PREORDER_KIND = "preorder_check";

/** One product's full Pre-order Check: a one-off payment, the total shown and charged as is. */
export const PREORDER_CHECK = { name: "Pre-order Check", pricePence: 2900 } as const;

export type PreorderCheckout = {
  checkId: string; // the PreorderCheck row
  email: string;
  asin: string;
  productTitle: string;
  productUrl: string; // the Amazon UK listing the UK price comes from
  supplierPrice: number; // £ per unit, the quote the check was run with
  supplierSource: string;
  baseUrl: string;
};

/** The Checkout Session for a Pre-order Check: £29, guest checkout with the buyer's email, and what to unlock. */
export function preorderCheckSessionParams(c: PreorderCheckout): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    kind: PREORDER_KIND,
    checkId: c.checkId,
    asin: c.asin,
    productUrl: c.productUrl,
    supplierPrice: c.supplierPrice.toFixed(2),
    supplierSource: c.supplierSource,
    email: c.email,
  };
  return {
    mode: "payment",
    customer_email: c.email,
    client_reference_id: c.checkId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: PREORDER_CHECK.pricePence,
          product_data: { name: `ProductRadar ${PREORDER_CHECK.name}`, description: c.productTitle.slice(0, 250) },
        },
      },
    ],
    metadata,
    payment_intent_data: { metadata: { kind: PREORDER_KIND, checkId: c.checkId } },
    success_url: `${c.baseUrl}/preorder-check/{CHECKOUT_SESSION_ID}`,
    cancel_url: `${c.baseUrl}/#check`,
  };
}

/**
 * The Pre-order Check a finished Checkout Session pays for, or null with why it pays for none: it must be
 * ours, paid, and exactly £29 in GBP.
 */
export function preorderPaymentFor(session: Stripe.Checkout.Session): { checkId: string; sessionId: string } | { checkId: null; reason: string } {
  const meta = session.metadata ?? {};
  if (session.mode !== "payment" || meta.kind !== PREORDER_KIND || !meta.checkId) return { checkId: null, reason: "not_a_preorder_check" };
  if (session.payment_status !== "paid") return { checkId: null, reason: "not_paid" };
  if (session.amount_total !== PREORDER_CHECK.pricePence || session.currency !== CURRENCY) return { checkId: null, reason: "amount_mismatch" };
  return { checkId: meta.checkId, sessionId: session.id };
}
