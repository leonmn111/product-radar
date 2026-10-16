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
 * Stripe test mode only, whatever CREDIT_PACKS_ON_SALE says: Agency includes 500 credits a month,
 * and granting them on each paid invoice isn't built yet.
 */
export const agencyOnSale = () => stripeTestMode();
