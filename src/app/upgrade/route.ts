import { connection, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { createCheckoutUrl } from "@/server/billing/checkout";
import { appUrl } from "@/lib/app-url";
import { BillingNotConfiguredError } from "@/server/billing/stripe";

// GET /upgrade — the single destination for every "Upgrade to Pro" button.
//   signed out → sign in, then come straight back here
//   signed in  → Stripe Checkout for Pro (£29/month, plans.ts), or the billing portal if already subscribed
export async function GET(request: NextRequest) {
  await connection();
  const base = appUrl(request.nextUrl.origin);
  const viewer = await getViewer();
  if (!viewer) return Response.redirect(`${base}/signin?callbackUrl=${encodeURIComponent("/upgrade")}`, 303);

  try {
    return Response.redirect(await createCheckoutUrl(db, viewer.id, base), 303);
  } catch (e) {
    if (!(e instanceof BillingNotConfiguredError)) console.error("[billing] checkout failed", e);
    const reason = e instanceof BillingNotConfiguredError ? "unavailable" : "error";
    return Response.redirect(`${base}/dashboard?billing=${reason}`, 303);
  }
}
