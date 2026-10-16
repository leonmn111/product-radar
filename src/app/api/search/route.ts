import { randomBytes } from "node:crypto";
import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { appUrl, originFromHeaders } from "@/lib/app-url";
import { db } from "@/lib/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { getViewer } from "@/server/auth/entitlements";
import { freeSearchesLeft, PRO_FREE_SEARCHES, recordSearch } from "@/server/billing/allowances";
import { createDbCreditStore, InsufficientCreditsError } from "@/server/billing/credits";
import { BudgetExceededError } from "@/server/live/budget";
import { liveRetailSource } from "@/server/live/config";
import { SourceError } from "@/server/sources/types";
import { searchProducts } from "@/services/dossierService";

const SEARCH_CREDITS = 1;
const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const Body = z.object({ q: z.string().trim().min(2, "Search for at least 2 characters.").max(120, "Keep the search under 120 characters.") });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

// POST /api/search  { "q": "ceramic coffee mug" }  →  { results: [...], cost: {...} }
// Amazon UK product search for signed-in people (agents use the x402 /api/agent/v2/search). A search
// costs 1 credit; on Pro the first 100 in each billing cycle are free. With no free searches and no
// credits: 402. The credit is taken first and returned if the search fails or finds nothing.
// Each result is one product (its best-placed listing, with its evidence), to open as a Dossier.
export async function POST(request: NextRequest) {
  await connection();
  const base = appUrl(request.nextUrl.origin);
  const origin = request.headers.get("origin");
  if (origin && origin !== base && origin !== originFromHeaders(request.headers)) {
    return json({ error: "forbidden", message: "Search from ProductRadar itself." }, 403);
  }
  const viewer = await getViewer();
  if (!viewer) return json({ error: "unauthenticated", message: "Sign in to search." }, 401);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_query", message: parsed.error.issues[0]?.message ?? "Send { \"q\": \"…\" }." }, 400);
  if (limiter.limited(viewer.id)) return json({ error: "rate_limited", message: "Too many searches. Please wait a minute and try again." }, 429);

  const live = liveRetailSource({ allowSample: true });
  if (!live.ready) return json({ error: "search_unavailable", message: "Search isn't switched on yet. No credits were used.", missing: live.missing }, 503);

  // Pro's free searches first; otherwise one credit.
  const freeLeft = await freeSearchesLeft(db, viewer.id);
  const free = freeLeft > 0;
  const credits = createDbCreditStore(db);
  const reference = `search-${randomBytes(16).toString("hex")}`;
  let balance = await credits.balance(viewer.id);
  if (!free) {
    try {
      balance = await credits.spend(viewer.id, SEARCH_CREDITS, reference);
    } catch (e) {
      if (!(e instanceof InsufficientCreditsError)) throw e;
      const why = viewer.tier === "PRO" ? `You've used this month's ${PRO_FREE_SEARCHES} free searches, and a` : "A";
      return json({ error: "insufficient_credits", message: `${why} search costs ${SEARCH_CREDITS} credit; you have ${e.balance}.`, needed: SEARCH_CREDITS, balance: e.balance }, 402);
    }
  }
  const giveBack = async () => {
    if (!free) balance = await credits.refund(viewer.id, SEARCH_CREDITS, reference);
  };

  let found;
  try {
    found = await searchProducts(parsed.data.q, live.retail);
  } catch (e) {
    await giveBack();
    if (e instanceof SourceError || e instanceof BudgetExceededError) {
      return json({ error: "source_unavailable", message: `${e.message} ${free ? "It didn't count as a free search." : "Your credit was returned."}`, balance }, 502);
    }
    console.error("[search] failed", e);
    return json({ error: "internal_error", message: "The search failed. Please try again.", balance }, 500);
  }
  // A search that finds nothing costs nothing.
  if (found.results.length === 0) await giveBack();
  else await recordSearch(db, viewer.id, free);
  const charged = !free && found.results.length > 0 ? SEARCH_CREDITS : 0;
  const freeSearchesLeftNow = free && found.results.length > 0 ? freeLeft - 1 : freeLeft;
  return json(
    {
      query: parsed.data.q,
      sample: live.sample,
      results: found.results,
      notes: [...found.notes, ...(live.sample ? ["Development sample data: a recorded Amazon UK search."] : [])],
      cost: { free: free && found.results.length > 0, creditsCharged: charged, creditsRemaining: balance, freeSearchesLeft: viewer.tier === "PRO" ? freeSearchesLeftNow : null },
    },
    200,
    { "X-Credits-Charged": String(charged), "X-Credits-Remaining": String(balance) },
  );
}
