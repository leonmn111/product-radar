import { connection, type NextRequest } from "next/server";
import { appUrl, originFromHeaders } from "@/lib/app-url";
import { db } from "@/lib/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { getViewer } from "@/server/auth/entitlements";
import { existingCustomerPortalUrl } from "@/server/billing/checkout";
import { BillingNotConfiguredError } from "@/server/billing/stripe";

// Each call creates a Stripe session, so cap how fast one account can make them.
const portalLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

// POST /api/billing/portal → { "url": "https://billing.stripe.com/…" }
// A Stripe customer portal session for the signed-in user (card, invoices,
// cancel), which returns them to /account. Only for accounts that have checked
// out before; everyone else is pointed to the upgrade instead.
export async function POST(request: NextRequest) {
  await connection();
  const base = appUrl(request.nextUrl.origin);

  // Only this site's own pages may ask (the session cookie is SameSite=Lax too).
  const origin = request.headers.get("origin");
  if (origin && origin !== base && origin !== originFromHeaders(request.headers)) {
    return Response.json({ error: "forbidden", message: "Open your account page on ProductRadar to manage billing." }, { status: 403 });
  }

  const viewer = await getViewer();
  if (!viewer) {
    return Response.json({ error: "unauthenticated", message: "Sign in to manage your subscription." }, { status: 401 });
  }
  if (portalLimiter.limited(viewer.id)) {
    return Response.json({ error: "rate_limited", message: "Too many requests. Please wait a minute and try again." }, { status: 429 });
  }

  try {
    const url = await existingCustomerPortalUrl(db, viewer.id, base);
    if (!url) {
      return Response.json(
        { error: "no_billing_account", message: "You don't have a subscription yet. Upgrade to Pro to start one." },
        { status: 409 },
      );
    }
    return Response.json({ url });
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return Response.json({ error: "billing_unavailable", message: "Billing isn't available right now." }, { status: 503 });
    }
    console.error("[billing] portal session failed", e);
    return Response.json(
      { error: "billing_error", message: "We couldn't reach the payment provider. Please try again in a moment." },
      { status: 502 },
    );
  }
}
