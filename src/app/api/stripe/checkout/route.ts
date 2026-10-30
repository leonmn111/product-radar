import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { appUrl, originFromHeaders } from "@/lib/app-url";
import { db } from "@/lib/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { getViewer } from "@/server/auth/entitlements";
import { createPlanCheckoutUrl } from "@/server/billing/checkout";
import { CHECKOUT_TIERS, type CheckoutTier } from "@/server/billing/plans";
import { agencyOnSale, creditPacksOnSale } from "@/server/billing/sales";
import { BillingNotConfiguredError } from "@/server/billing/stripe";

// Each call creates a Stripe session, so cap how fast one account can make them.
const checkoutLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

const Body = z.object({ tier: z.enum(CHECKOUT_TIERS as [CheckoutTier, ...CheckoutTier[]]) });

// POST /api/stripe/checkout  { "tier": "starter" | "growth" | "scale" | "pro" | "agency" }  →  { "url": "https://checkout.stripe.com/…" }
// Stripe Checkout for a credit pack (£10 / £25 / £50 for 20 / 55 / 120 credits) or a subscription
// (Pro £29/month, Agency £149/month), for the signed-in user. Prices are in src/server/billing/plans.ts.
// (Pro is also sold through /upgrade, the site's existing button.)
//
// On sale only when creditPacksOnSale() says so, and Agency only when agencyOnSale() does
// (src/server/billing/sales.ts).
export async function POST(request: NextRequest) {
  await connection();
  const base = appUrl(request.nextUrl.origin);

  if (!creditPacksOnSale()) {
    return Response.json(
      { error: "not_on_sale", message: "Top-ups aren't available yet. You haven't been charged." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Only this site's own pages may ask (the session cookie is SameSite=Lax too).
  const origin = request.headers.get("origin");
  if (origin && origin !== base && origin !== originFromHeaders(request.headers)) {
    return Response.json({ error: "forbidden", message: "Top up your balance from your ProductRadar account page." }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_tier", message: `Choose one of: ${CHECKOUT_TIERS.join(", ")}.` }, { status: 400 });
  }

  if (parsed.data.tier === "agency" && !agencyOnSale()) {
    return Response.json(
      { error: "not_on_sale", message: "The Agency plan isn't on sale yet. You haven't been charged." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "unauthenticated", message: "Sign in to top up your balance." }, { status: 401 });
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
