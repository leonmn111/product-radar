import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { appUrl, originFromHeaders } from "@/lib/app-url";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";
import { getViewer } from "@/server/auth/entitlements";
import { createPlanCheckoutUrl } from "@/server/billing/checkout";
import { CHECKOUT_TIERS, type CheckoutTier } from "@/server/billing/plans";
import { BillingNotConfiguredError } from "@/server/billing/stripe";

// Each call creates a Stripe session, so cap how fast one account can make them.
const checkoutLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

const Body = z.object({ tier: z.enum(CHECKOUT_TIERS as [CheckoutTier, ...CheckoutTier[]]) });

// POST /api/stripe/checkout  { "tier": "starter" | "growth" | "scale" | "pro" }  →  { "url": "https://checkout.stripe.com/…" }
// Stripe Checkout for a credit pack (£10 / £25 / £50 for 20 / 55 / 120 credits) or the v2 Pro
// subscription (£29/month), for the signed-in user. Prices are in src/server/billing/plans.ts.
//
// STRIPE TEST MODE ONLY, never production: credits are only recorded in memory until the credit
// ledger exists (src/server/billing/credits.ts), and the £29 Pro sits beside the live £39 Pro until
// the owner decides how the two relate. With a live Stripe key (even on a laptop) nothing is sold.
const onSale = () => env.NODE_ENV !== "production" && /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? "");

export async function POST(request: NextRequest) {
  await connection();
  const base = appUrl(request.nextUrl.origin);

  if (!onSale()) {
    return Response.json(
      { error: "not_on_sale", message: "Credit packs aren't on sale yet. You haven't been charged." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Only this site's own pages may ask (the session cookie is SameSite=Lax too).
  const origin = request.headers.get("origin");
  if (origin && origin !== base && origin !== originFromHeaders(request.headers)) {
    return Response.json({ error: "forbidden", message: "Buy credits from your ProductRadar account page." }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_tier", message: `Choose one of: ${CHECKOUT_TIERS.join(", ")}.` }, { status: 400 });
  }

  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "unauthenticated", message: "Sign in to buy credits." }, { status: 401 });
  if (checkoutLimiter.limited(viewer.id)) {
    return Response.json({ error: "rate_limited", message: "Too many requests. Please wait a minute and try again." }, { status: 429 });
  }

  try {
    return Response.json({ url: await createPlanCheckoutUrl(db, viewer.id, base, parsed.data.tier) });
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return Response.json({ error: "billing_unavailable", message: "Billing isn't available right now." }, { status: 503 });
    }
    console.error("[billing] plan checkout failed", e);
    return Response.json({ error: "billing_error", message: "We couldn't reach the payment provider. Please try again in a moment." }, { status: 502 });
  }
}
