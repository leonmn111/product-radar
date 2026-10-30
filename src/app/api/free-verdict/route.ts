import { randomBytes } from "node:crypto";
import { connection, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";
import { clientAddress } from "@/server/auth/password";
import { liveSources } from "@/server/live/config";
import { searchTermFor, titleSimilarity } from "@/server/live/match";
import { parseProductLink } from "@/server/live/productLink";
import { signUnlock } from "@/server/live/quickToken";
import { isSourceFailure, reportSourceFailure } from "@/server/live/unavailable";
import { QueryBudget } from "@/server/live/budget";
import { dbDossierCache } from "@/services/dossierCache";
import { getProductDossier, searchProducts } from "@/services/dossierService";
import { dbFreeVerdictQuota, utcDay } from "@/services/freeVerdicts";
import { matchedSupplier, parseSupplierPrice, quickVerdict, subjectFlags, type QuickSupplier } from "@/services/quickVerdict";
import type { QuickCheck } from "@/types/quickCheck";

// POST /api/free-verdict { link, supplierPrice? } — the homepage check, free and without an account: a
// TikTok Shop, Amazon UK or AliExpress product link and the visitor's supplier price in, a quick verdict
// (Launch / Test small / Avoid / Not enough evidence) and what they'd keep per sale out
// (services/quickVerdict.ts). The full breakdown sits behind an email (POST /api/free-verdict/unlock),
// which this answer's signed unlockToken lets it rebuild from the cached Dossier.
//
// The UK selling price always comes from Amazon UK listings of the product. An AliExpress link is read with
// AliExpress's official API (its title, its price when the visitor gives none, the brand it states); a
// TikTok Shop link only for the product name in its address (TikTok pages are never fetched). Either way
// that name is found on Amazon UK, and the answer names the listing it matched.
//
// Spending is bounded twice: per visitor (FREE_VERDICTS_PER_VISITOR a day, by IP, per server process) and
// site-wide (FREE_VERDICTS_PER_DAY live checks a UTC day, in the database). An Amazon product already in the
// 48-hour cache costs nothing and doesn't use a site-wide slot; a failed check gives its slots back.

const DAY_MS = 24 * 60 * 60 * 1000;
const visitors = createRateLimiter({ windowMs: DAY_MS, max: env.FREE_VERDICTS_PER_VISITOR });
const noStore = { "Cache-Control": "no-store" };
const signUpFor = (asin: string) => `/signin?tab=register&callbackUrl=${encodeURIComponent(`/terminal?asin=${asin}`)}`;
/** A pasted product and its Amazon UK match must share at least half the shorter title's words. */
const MATCH_MIN = 0.5;

export async function POST(request: NextRequest) {
  await connection();
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: noStore });

  const body = (await request.json().catch(() => null)) as { link?: unknown; supplierPrice?: unknown } | null;
  const link = parseProductLink(typeof body?.link === "string" ? body.link.slice(0, 2048) : "");
  if (!link.ok) return json({ error: "invalid_link", message: link.message }, 400);
  const yourPrice = parseSupplierPrice(body?.supplierPrice);
  if (Number.isNaN(yourPrice)) return json({ error: "invalid_price", message: "Enter your supplier price per unit in pounds, like 4.50." }, 400);

  // Real sources only: a free check is never built from development sample data.
  const live = liveSources();
  if (!live.ready) return json({ error: "live_search_unavailable", message: "Live checks aren't switched on right now. Please try again later." }, 503);

  const visitor = clientAddress(request.headers) ?? "unknown";
  if (visitors.limited(visitor)) {
    return json({ error: "free_check_used", message: "You've had today's free checks. Create a free account to keep checking products: your first full Dossier is free.", signUp: "/signin?tab=register" }, 429);
  }

  const now = new Date();
  const day = utcDay(now);
  const cached = link.kind === "amazon" ? await dbDossierCache.get(link.asin, now).catch(() => null) : null;
  let reserved = false;
  if (!cached || cached.sample) {
    reserved = await dbFreeVerdictQuota.reserve(day, env.FREE_VERDICTS_PER_DAY);
    if (!reserved) {
      visitors.reset(visitor); // they didn't get a check
      return json({ error: "free_checks_exhausted", message: "Today's free checks have all been used. Create a free account to check this product now.", signUp: "/signin?tab=register" }, 429);
    }
  }
  const giveBack = async () => {
    visitors.reset(visitor);
    if (reserved) await dbFreeVerdictQuota.release(day).catch((e) => console.error("[free-verdict] couldn't release a slot", e));
  };
  const notFound = async (message: string) => {
    await giveBack();
    return json({ error: "no_product", message }, 404);
  };

  try {
    // 1. Which Amazon UK product the UK price comes from, and what's being sold.
    let asin: string;
    let pasted: { name: string; brand: string | null } | null = null;
    let linkSupplier: QuickSupplier | null = null;
    if (link.kind === "amazon") {
      asin = link.asin;
    } else {
      if (link.kind === "aliexpress") {
        const listing = await live.sources.supplier.product?.(link.productId, "GB", new QueryBudget({ maxCalls: 1, deadlineMs: 15_000 }));
        if (!listing) return notFound("That AliExpress product isn't on sale for delivery to the UK. Check the link opens a product page, then try again.");
        pasted = { name: listing.title, brand: listing.brand };
        if (listing.unitPrice.currency === "GBP") linkSupplier = { amount: listing.unitPrice.amount, source: "aliexpress_link", evidence: { ...listing.evidence, sourceType: "supplier", publishedAt: null, value: listing.unitPrice.amount } };
      } else {
        pasted = { name: link.name, brand: null };
      }
      const { results } = await searchProducts(searchTermFor(pasted.name), live.sources.retail, { maxResults: 10 });
      const match = results.find((r) => titleSimilarity(pasted!.name, r.title) >= MATCH_MIN);
      if (!match) return notFound("We couldn't find this product on Amazon UK, so there's no UK price to check it against. Try its Amazon UK link instead.");
      asin = match.asin;
    }

    // 2. The product's Dossier (cached for 48 hours), then the quick verdict.
    // No fixed clock here: the Dossier is dated when it's built, after the providers answer.
    const result = await getProductDossier(asin, { sources: live.sources, cache: dbDossierCache, sample: false, id: randomBytes(32).toString("hex") });
    if (!result) return notFound("Amazon UK has no priced product at that link. Check it opens a product page, then try again.");
    // Someone else cached it a moment ago and nothing else was asked: the slot goes back.
    if (result.cache === "hit" && reserved && link.kind === "amazon") await dbFreeVerdictQuota.release(day).catch(() => {});

    const d = result.dossier;
    const supplier: QuickSupplier | null = yourPrice !== null ? { amount: yourPrice, source: "you", evidence: null } : (linkSupplier ?? matchedSupplier(d));
    const q = quickVerdict(d, subjectFlags(d, pasted), supplier, new Date());
    const keep = q.margin ? q.margin.breakEvenAdCost.amount : null;
    const check: QuickCheck = {
      link: link.kind,
      product: { asin, title: d.product.title, url: `https://www.amazon.co.uk/dp/${asin}` },
      pastedName: pasted?.name ?? null,
      verdict: { tier: q.tier, gate: q.gate, label: q.label },
      keepPerSale: keep,
      sellingPrice: q.sellingPrice,
      supplierPrice: supplier && q.margin ? { amount: supplier.amount, source: supplier.source } : null,
      reason: q.reason,
      missing: q.missing,
      unlockToken:
        q.margin && supplier
          ? signUnlock({ asin, link: link.kind, name: pasted?.name ?? null, brand: pasted?.brand ?? null, supplier }, env.AUTH_SECRET, new Date())
          : null,
      fromCache: result.cache === "hit",
      fullDossier: signUpFor(asin),
    };
    return json(check, 200);
  } catch (e) {
    await giveBack();
    if (!isSourceFailure(e)) throw e;
    return json({ error: "source_unavailable", message: `${reportSourceFailure("free-verdict", e)} Your free check wasn't used; try again in a few minutes.` }, 503);
  }
}
