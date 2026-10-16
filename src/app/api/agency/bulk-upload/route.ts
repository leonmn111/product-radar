import { after, connection, type NextRequest } from "next/server";
import { appUrl, originFromHeaders } from "@/lib/app-url";
import { db } from "@/lib/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { getViewer } from "@/server/auth/entitlements";
import { InsufficientCreditsError, spendCreditsInTransaction } from "@/server/billing/credits";
import { PLANS, planPriceLabel } from "@/server/billing/plans";
import { liveSources } from "@/server/live/config";
import { BULK_CREDITS_PER_ASIN, createBulkJob, ensureProcessing, MAX_BULK_ASINS, parseAsinCsv } from "@/services/bulkJobs";
import { bulkDeps } from "./run";

const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
const MAX_BYTES = 64 * 1024;
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The uploaded CSV: a file field ("file") in a form, or the raw body (text/csv), or { "csv": "…" }. */
async function csvText(request: NextRequest): Promise<string | null> {
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file") ?? form?.get("csv");
    return typeof file === "string" ? file : file ? await file.text() : null;
  }
  if (type.startsWith("application/json")) {
    const body = (await request.json().catch(() => null)) as { csv?: unknown } | null;
    return typeof body?.csv === "string" ? body.csv : null;
  }
  return request.text();
}

// POST /api/agency/bulk-upload: an Agency account's CSV of up to 100 ASINs (an "asin" column or the
// first one; Amazon product links work too) → 202 { jobId, … }, then each ASIN is scored as a Standard
// Dossier in the background. 1 credit per ASIN, taken up front in the same transaction that creates
// the job: with too few credits nothing happens at all. Failed items are refunded. Progress:
// GET /api/agency/bulk-upload/{jobId}.
export async function POST(request: NextRequest) {
  await connection();
  const base = appUrl(request.nextUrl.origin);
  const origin = request.headers.get("origin");
  if (origin && origin !== base && origin !== originFromHeaders(request.headers)) {
    return json({ error: "forbidden", message: "Upload from ProductRadar itself." }, 403);
  }
  const viewer = await getViewer();
  if (!viewer) return json({ error: "unauthenticated", message: "Sign in with your Agency account to upload." }, 401);
  // The plan is read from the database, not the session, so a cancelled Agency plan stops at once.
  const user = await db.user.findUnique({ where: { id: viewer.id }, select: { subscriptionTier: true } });
  if (user?.subscriptionTier !== "AGENCY") {
    return json(
      {
        error: "agency_required",
        message: `Bulk uploads are part of the Agency plan (${planPriceLabel(PLANS.agency)}): score up to ${MAX_BULK_ASINS} products at once, with 500 credits a month and Standard Dossiers at 1 credit each.`,
      },
      403,
    );
  }
  if (limiter.limited(viewer.id)) return json({ error: "rate_limited", message: "Too many uploads. Please wait a minute and try again." }, 429);

  const live = liveSources({ allowSample: true });
  if (!live.ready) {
    return json({ error: "live_search_unavailable", message: "Live Dossiers aren't switched on yet. No credits were used.", missing: live.missing }, 503);
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return json({ error: "too_large", message: "The file is over 64 KB." }, 413);
  const text = await csvText(request);
  if (text === null || text.length > MAX_BYTES) return json({ error: "invalid_csv", message: "Send a CSV file (form field \"file\"), a text/csv body, or { \"csv\": \"…\" }, up to 64 KB." }, 400);
  const parsed = parseAsinCsv(text);
  if (parsed.invalid.length) {
    return json({ error: "invalid_rows", message: `${parsed.invalid.length} row(s) aren't Amazon ASINs. Nothing was charged.`, invalid: parsed.invalid.slice(0, 20) }, 400);
  }
  if (parsed.asins.length === 0) return json({ error: "empty_csv", message: "The file has no ASINs." }, 400);
  if (parsed.asins.length > MAX_BULK_ASINS) {
    return json({ error: "too_many_rows", message: `A bulk upload takes up to ${MAX_BULK_ASINS} ASINs; this one has ${parsed.asins.length}. Nothing was charged.` }, 400);
  }

  let created;
  try {
    created = await createBulkJob(db, viewer.id, parsed.asins, (tx, items) => spendCreditsInTransaction(tx, viewer.id, items));
  } catch (e) {
    if (!(e instanceof InsufficientCreditsError)) {
      console.error("[bulk] upload failed", e); // the transaction rolled back: nothing was charged
      return json({ error: "internal_error", message: "The upload couldn't be saved. Nothing was charged; please try again." }, 500);
    }
    return json(
      { error: "insufficient_credits", message: `${parsed.asins.length} ASINs need ${e.needed} credits; you have ${e.balance}. Nothing was charged or queued.`, needed: e.needed, balance: e.balance },
      402,
    );
  }
  const { job, balance } = created;
  after(() => ensureProcessing(db, job.id, bulkDeps(live, base)));
  return json(
    {
      jobId: job.id,
      status: job.status,
      total: job.total,
      duplicatesIgnored: parsed.duplicates,
      creditsCharged: job.total * BULK_CREDITS_PER_ASIN,
      balance,
      statusUrl: `/api/agency/bulk-upload/${job.id}`,
    },
    202,
  );
}
