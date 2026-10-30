import { randomBytes } from "node:crypto";
import { connection, type NextRequest } from "next/server";
import { simulatedImageMatcher } from "@/engine/imageMatch";
import { appUrl, originFromHeaders } from "@/lib/app-url";
import { db } from "@/lib/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { getViewer } from "@/server/auth/entitlements";
import { createDbCreditStore, InsufficientCreditsError } from "@/server/billing/credits";
import { balanceGbp, creditsGbp, STANDARD_DOSSIER_CREDITS } from "@/server/billing/plans";
import { liveSources } from "@/server/live/config";
import { isSourceFailure, reportSourceFailure } from "@/server/live/unavailable";
import { dbDossierCache } from "@/services/dossierCache";
import { getProductDossier } from "@/services/dossierService";
import { saveDossier } from "@/services/dossierStore";

// Each call can spend credits and provider calls, so cap how fast one account can make them.
const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

// POST /api/dossier/B0CH33F5P2 → the Standard Dossier for one Amazon UK product, paid in platform
// credits by the signed-in user: 4 credits (£2.00), or 1 on Pro (src/server/billing/plans.ts). Agents
// pay in USDC at /api/agent/v2/dossier/{asin} instead. Served from the 48-hour cache when a fresh copy
// exists (X-Dossier-Cache: hit). Credits are taken before the work and given back if it fails, so a
// balance can't be spent twice by simultaneous requests.
export async function POST(request: NextRequest, { params }: { params: Promise<{ asin: string }> }) {
  await connection();
  const base = appUrl(request.nextUrl.origin);
  const origin = request.headers.get("origin");
  if (origin && origin !== base && origin !== originFromHeaders(request.headers)) {
    return json({ error: "forbidden", message: "Open Dossiers from ProductRadar itself." }, 403);
  }
  const asin = (await params).asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return json({ error: "invalid_asin", message: "Use a 10-character Amazon UK ASIN, e.g. B0CH33F5P2." }, 400);
  }
  const viewer = await getViewer();
  if (!viewer) return json({ error: "unauthenticated", message: "Sign in to open a Dossier." }, 401);
  if (limiter.limited(viewer.id)) return json({ error: "rate_limited", message: "Too many requests. Please wait a minute and try again." }, 429);

  // Development sample data is allowed outside production only (liveSources refuses it in production).
  const live = liveSources({ allowSample: true });
  if (!live.ready) {
    return json({ error: "live_search_unavailable", message: "Live Dossiers aren't switched on yet. Nothing was charged.", missing: live.missing }, 503);
  }

  const credits = createDbCreditStore(db);
  const cost = STANDARD_DOSSIER_CREDITS[viewer.tier];
  const id = randomBytes(32).toString("hex");
  let balance: number;
  try {
    balance = await credits.spend(viewer.id, cost, id);
  } catch (e) {
    if (!(e instanceof InsufficientCreditsError)) throw e;
    return json(
      { error: "insufficient_credits", message: `A Standard Dossier costs ${creditsGbp(cost)}; your balance is ${balanceGbp(e.balance)}.`, needed: cost, balance: e.balance },
      402,
    );
  }

  const fail = async (status: number, body: { error: string; message: string }) => {
    balance = await credits.refund(viewer.id, cost, id);
    return json({ ...body, message: `${body.message} Your ${creditsGbp(cost)} was returned to your balance.`, balance }, status);
  };
  try {
    const result = await getProductDossier(asin, {
      sources: live.sources,
      cache: dbDossierCache,
      sample: live.sample,
      notes: live.sample ? ["Development sample data: the supplier offers are made up."] : [],
      // Image similarity is simulated until a real matcher exists, so it only ever runs on sample data.
      imageMatcher: live.sample ? simulatedImageMatcher : undefined,
      id,
    });
    if (!result) return await fail(404, { error: "no_product", message: `Amazon UK has no priced product ${asin}.` });
    await saveDossier(result.dossier);
    return json(result.dossier, 200, { "X-Dossier-Cache": result.cache, "X-Credits-Charged": String(cost), "X-Credits-Remaining": String(balance) });
  } catch (e) {
    if (isSourceFailure(e)) return await fail(503, { error: "source_unavailable", message: `${reportSourceFailure("dossier", e)} Try again in a few minutes.` });
    console.error("[dossier] credit request failed", asin, e);
    return await fail(500, { error: "internal_error", message: "The Dossier couldn't be built." });
  }
}
