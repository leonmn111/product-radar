import { randomBytes } from "node:crypto";
import { connection, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";
import { clientAddress } from "@/server/auth/password";
import { resaleRisk } from "@/components/dashboard/resellability";
import { parseAmazonUkLink } from "@/server/live/amazonLink";
import { liveSources } from "@/server/live/config";
import { isSourceFailure, reportSourceFailure } from "@/server/live/unavailable";
import { dbDossierCache } from "@/services/dossierCache";
import { getProductDossier } from "@/services/dossierService";
import { dbFreeVerdictQuota, utcDay } from "@/services/freeVerdicts";
import type { Dossier } from "@/types/dossier";
import type { FreeVerdict } from "@/types/freeVerdict";

// POST /api/free-verdict { link } — the landing page's paste box: one Amazon UK product's verdict and its
// confidence, free and without an account. The full Dossier (margins, suppliers, evidence) stays behind a
// free sign-up. Spending is bounded twice: per visitor (FREE_VERDICTS_PER_VISITOR a day, by IP, per server
// process) and site-wide (FREE_VERDICTS_PER_DAY live checks a UTC day, in the database). A product already
// in the 48-hour cache costs nothing and doesn't use a site-wide slot; a failed check gives its slots back.
// The Dossier it builds is cached, so the visitor's paid Dossier after sign-up reuses it.

const DAY_MS = 24 * 60 * 60 * 1000;
const visitors = createRateLimiter({ windowMs: DAY_MS, max: env.FREE_VERDICTS_PER_VISITOR });
const noStore = { "Cache-Control": "no-store" };
const signUpFor = (asin: string) => `/signin?tab=register&callbackUrl=${encodeURIComponent(`/terminal?asin=${asin}`)}`;

/** What the free check shows: the verdict and how sure it is. Its reasons carry the margin figures, which are the paid part. */
function teaser(d: Dossier, asin: string, fromCache: boolean): FreeVerdict {
  const v = d.verdict;
  return {
    asin,
    title: d.product.title,
    verdict:
      v.status === "shown"
        ? { status: "shown", kind: v.value.kind, confidence: v.confidence }
        : { status: "withheld", reason: v.reason, confidence: v.confidence, missing: v.missing },
    evidenceCount: new Set(d.evidence.map((e) => e.sourceUrl)).size, // distinct pages: one read four times counts once
    supplierMatches: d.supplierMatches.length,
    risk: resaleRisk(d.resellability),
    fromCache,
    fullDossier: signUpFor(asin),
  };
}

export async function POST(request: NextRequest) {
  await connection();
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: noStore });

  const body = (await request.json().catch(() => null)) as { link?: unknown } | null;
  const link = parseAmazonUkLink(typeof body?.link === "string" ? body.link.slice(0, 2048) : "");
  if (!link.ok) return json({ error: "invalid_link", message: link.message }, 400);

  // Real sources only: a free verdict is never built from development sample data.
  const live = liveSources();
  if (!live.ready) return json({ error: "live_search_unavailable", message: "Live checks aren't switched on right now. Please try again later." }, 503);

  const visitor = clientAddress(request.headers) ?? "unknown";
  if (visitors.limited(visitor)) {
    return json({ error: "free_check_used", message: "You've had today's free check. Create a free account to keep checking products.", signUp: signUpFor(link.asin) }, 429);
  }

  const now = new Date();
  const day = utcDay(now);
  const cached = await dbDossierCache.get(link.asin, now).catch(() => null);
  let reserved = false;
  if (!cached || cached.sample) {
    reserved = await dbFreeVerdictQuota.reserve(day, env.FREE_VERDICTS_PER_DAY);
    if (!reserved) {
      visitors.reset(visitor); // they didn't get a check
      return json({ error: "free_checks_exhausted", message: "Today's free checks have all been used. Create a free account to check this product now.", signUp: signUpFor(link.asin) }, 429);
    }
  }
  const giveBack = async () => {
    visitors.reset(visitor);
    if (reserved) await dbFreeVerdictQuota.release(day).catch((e) => console.error("[free-verdict] couldn't release a slot", e));
  };

  try {
    // No fixed clock here: the Dossier is dated when it's built, after the providers answer. A clock frozen at
    // the start of the request dates every piece of evidence in the future, and confidence ignores those.
    const result = await getProductDossier(link.asin, { sources: live.sources, cache: dbDossierCache, sample: false, id: randomBytes(32).toString("hex") });
    if (!result) {
      await giveBack();
      return json({ error: "no_product", message: "Amazon UK has no priced product at that link. Check it opens a product page, then try again." }, 404);
    }
    // Someone else cached it a moment ago: no provider was called, so the slot goes back.
    if (result.cache === "hit" && reserved) await dbFreeVerdictQuota.release(day).catch(() => {});
    return json(teaser(result.dossier, link.asin, result.cache === "hit"), 200);
  } catch (e) {
    await giveBack();
    if (!isSourceFailure(e)) throw e;
    return json({ error: "source_unavailable", message: `${reportSourceFailure("free-verdict", e)} Your free check wasn't used; try again in a few minutes.` }, 503);
  }
}
