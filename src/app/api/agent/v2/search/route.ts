import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { liveSources } from "@/server/live/config";
import { runLiveSearch } from "@/server/live/search";
import { MARKETS, type Market } from "@/server/live/types";
import { withX402Payment } from "@/server/payments/x402/middleware";
import { LATEST_FX } from "@/server/scoring/fx-latest";

// The price of one live search (ROADMAP.md, decision 3).
const LIVE_SEARCH_PRICE_USDC = "0.50";

const Query = z.object({
  q: z.string().trim().min(2, "q must be at least 2 characters").max(120),
  markets: z
    .string()
    .default("US,GB")
    .transform((v) => [...new Set(v.toUpperCase().split(",").map((m) => m.trim()).filter(Boolean))])
    .pipe(z.array(z.enum(Object.keys(MARKETS) as [Market, ...Market[]])).min(1, "markets must list US and/or GB")),
});

const parse = (request: NextRequest) => Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
const invalid = (issues: z.core.$ZodIssue[]) =>
  Response.json({ error: "invalid_query", issues: issues.map((i) => ({ field: i.path.join("."), message: i.message })) }, { status: 400 });

// The paid part. Payment is verified before this runs, and only settled for a 2xx answer
// (payments/x402): a query where nothing clears the 0.7 gate is answered 404 and not charged.
const paidSearch = withX402Payment(
  {
    description: "ProductRadar live search: cited product opportunities from Amazon US/UK and suppliers, 0.7 confidence minimum",
    priceUsdc: LIVE_SEARCH_PRICE_USDC,
  },
  async (request: NextRequest) => {
    const parsed = parse(request);
    if (!parsed.success) return invalid(parsed.error.issues);
    const live = liveSources();
    if (!live.ready) return Response.json({ error: "live_search_unavailable", missing: live.missing }, { status: 503 });
    const result = await runLiveSearch(parsed.data.q, parsed.data.markets, { ...live.sources, fx: LATEST_FX });
    if (result.results.length === 0) {
      return Response.json(
        {
          error: "no_confident_results",
          message: "Nothing cleared the 0.7 confidence gate, so you were not charged. `withheld` lists what evidence was missing.",
          ...result,
        },
        { status: 404 },
      );
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  },
);

// GET /api/agent/v2/search?q=magnetic+power+bank&markets=US,GB
// Checked before any payment is asked for: a bad query, or live search not switched on yet.
export async function GET(request: NextRequest) {
  await connection();
  const parsed = parse(request);
  if (!parsed.success) return invalid(parsed.error.issues);
  const live = liveSources();
  if (!live.ready) {
    return Response.json(
      { error: "live_search_unavailable", message: "Live search isn't switched on yet. You were not asked to pay.", missing: live.missing },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return paidSearch(request);
}
