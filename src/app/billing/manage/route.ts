import { connection, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { createPortalUrl } from "@/server/billing/checkout";
import { appUrl } from "@/lib/app-url";
import { BillingNotConfiguredError } from "@/server/billing/stripe";

// GET /billing/manage — Stripe customer portal (update card, invoices, cancel).
export async function GET(request: NextRequest) {
  await connection();
  const base = appUrl(request.nextUrl.origin);
  const viewer = await getViewer();
  if (!viewer) return Response.redirect(`${base}/signin?callbackUrl=${encodeURIComponent("/billing/manage")}`, 303);

  try {
    return Response.redirect(await createPortalUrl(db, viewer.id, base), 303);
  } catch (e) {
    if (!(e instanceof BillingNotConfiguredError)) console.error("[billing] portal failed", e);
    return Response.redirect(`${base}/?billing=${e instanceof BillingNotConfiguredError ? "unavailable" : "error"}`, 303);
  }
}
