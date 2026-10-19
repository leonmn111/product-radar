// Whether credit packs and the Agency plan are on sale. Billing module only; the checkout route and the buy
// buttons both ask here, so the buttons are never live when the checkout would refuse.

import "server-only";
import { env } from "@/lib/env";

const stripeTestMode = () => env.NODE_ENV !== "production" && /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? "");

/**
 * On with a Stripe test key outside production, or once the owner sets CREDIT_PACKS_ON_SALE=on
 * (after a test-mode run: the checkout parameters haven't been tried against Stripe itself yet).
 */
export const creditPacksOnSale = () => env.CREDIT_PACKS_ON_SALE === "on" || stripeTestMode();

/**
 * The same owner switch as credit packs: Agency's 500 monthly credits are granted on each paid
 * invoice (invoice.payment_succeeded, webhook.ts), so nothing else holds it back.
 */
export const agencyOnSale = () => creditPacksOnSale();
