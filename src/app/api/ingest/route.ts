import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { FetchPageError } from "@/server/ingest/fetch-page";
import { IngestError, ingestUrl } from "@/server/ingest/ingest";

const Body = z.object({
  url: z.string().trim().min(1, "Paste a product URL").max(2048).url("That isn't a valid URL"),
  category: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Category must be lowercase words joined by dashes, e.g. running-shoes")
    .max(48)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// Very small in-memory limiter: each ingest makes outbound requests to a third
// party, so cap how fast one client can trigger them. Per server process only.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();
function rateLimited(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

const FETCH_ERROR_STATUS: Record<FetchPageError["code"], number> = {
  invalid_url: 400,
  blocked_host: 400,
  robots_disallowed: 422,
  not_html: 422,
  too_large: 422,
  http_error: 502,
  timeout: 504,
  network_error: 502,
};

// POST /api/ingest  { "url": "https://store.example/products/x", "category": "running-shoes" }
// Fetches the page, extracts structured product data, stores Product / Offer /
// Evidence, and recalculates scores for the product's category.
export async function POST(request: NextRequest) {
  await connection();

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(client)) {
    return Response.json(
      { error: "rate_limited", message: `Too many requests — max ${MAX_PER_WINDOW} per minute.` },
      { status: 429 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await ingestUrl(db, parsed.data);
    return Response.json(result, { status: result.status === "created" ? 201 : 200 });
  } catch (e) {
    if (e instanceof FetchPageError) {
      return Response.json({ error: e.code, message: e.message }, { status: FETCH_ERROR_STATUS[e.code] });
    }
    if (e instanceof IngestError) {
      return Response.json({ error: e.code, message: e.message }, { status: 422 });
    }
    console.error("[ingest] unexpected error", e);
    return Response.json(
      { error: "internal_error", message: "Something went wrong while saving this product." },
      { status: 500 },
    );
  }
}
