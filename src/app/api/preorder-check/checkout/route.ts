import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";
import { clientAddress } from "@/server/auth/password";
import { createPreorderCheckout } from "@/server/billing/preorderCheck";
import { creditPacksOnSale } from "@/server/billing/sales";
import { BillingNotConfiguredError } from "@/server/billing/stripe";
import { verifyUnlock } from "@/server/live/quickToken";
import { dbDossierCache } from "@/services/dossierCache";
import { preorderCheckPath } from "@/services/preorderReport";

// POST /api/preorder-check/checkout { token, email } — the homepage check's payment wall: a Stripe Checkout
// for one product's £29 Pre-order Check, for an email that has used its free breakdowns. No account. The
// signed token names the product and the supplier price the check was run with; an email that has already
// paid for this product is sent back to its check instead of paying again. On sale with the same owner
// switch as credit packs (sales.ts).

const DAY_MS = 24 * 60 * 60 * 1000;
const visitors = createRateLimiter({ windowMs: DAY_MS, max: 20 });
const noStore = { "Cache-Control": "no-store" };
const Body = z.object({
  token: z.string().min(10).max(4000),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});

export async function POST(request: NextRequest) {
  await connection();
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: noStore });
  if (!creditPacksOnSale()) return json({ error: "not_on_sale", message: "The Pre-order Check isn't on sale yet. You haven't been charged." }, 503);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_request", message: "Enter a valid email address, then try again." }, 400);
  if (visitors.limited(clientAddress(request.headers) ?? "unknown")) return json({ error: "too_many", message: "Too many attempts from here today. Please try again tomorrow." }, 429);

  const now = new Date();
  const claims = verifyUnlock(parsed.data.token, env.AUTH_SECRET, now);
  const dossier = claims ? await dbDossierCache.get(claims.asin, now) : null;
  if (!claims || !dossier) return json({ error: "expired", message: "This check has expired. Run it again, then buy its Pre-order Check." }, 410);

  const email = parsed.data.email;
  const paid = await db.preorderCheck.findFirst({ where: { email, asin: claims.asin, status: "PAID" }, select: { stripeSessionId: true } });
  if (paid?.stripeSessionId) return json({ url: preorderCheckPath(paid.stripeSessionId), alreadyPaid: true }, 200);

  const { asin, link, name, brand, supplier } = claims;
  try {
    const url = await createPreorderCheckout(db, { email, claims: { asin, link, name, brand, supplier }, productTitle: dossier.product.title, baseUrl: appUrl(request.nextUrl.origin) });
    return json({ url }, 200);
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) return json({ error: "billing_unavailable", message: "Payments aren't available right now. You haven't been charged." }, 503);
    console.error("[preorder] checkout failed", e);
    return json({ error: "checkout_failed", message: "We couldn't open checkout just now. You haven't been charged; please try again." }, 502);
  }
}
