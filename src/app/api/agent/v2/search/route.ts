import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { BudgetExceededError } from "@/server/live/budget";
import { liveSources } from "@/server/live/config";
import { newPaymentIdentifier, withDiscoveryHeaders } from "@/server/payments/x402/discovery";
import { withX402Payment } from "@/server/payments/x402/middleware";
import { SourceError } from "@/server/sources/types";
import { buildDossier, fetchDossierData } from "@/services/dossierService";

// The base search price (ROADMAP.md, pricing: Search $0.01).
const SEARCH_PRICE_USDC = "0.01";

const Query = z.object({ q: z.string().trim().min(2, "q must be at least 2 characters").max(120) });

// GET /api/agent/v2/search?q=ceramic+coffee+mug
// Returns the 8-part Dossier for the product most Amazon UK listings agree on. Every response carries
// the x402 discovery headers; payment is the standard x402 v2 flow (402 → PAYMENT-SIGNATURE → 200).
// A bad query, or live sources not being connected, is answered before any payment is asked for. A
// failed source or a search with no listings is a non-2xx answer, so it isn't charged.
export async function GET(request: NextRequest) {
  await connection();
  const paymentId = newPaymentIdentifier();
  const respond = (res: Response) => withDiscoveryHeaders(res, SEARCH_PRICE_USDC, paymentId);

  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return respond(
      Response.json({ error: "invalid_query", issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) }, { status: 400 }),
    );
  }
  // Development sample data is allowed outside production only (liveSources refuses it in production).
  const live = liveSources({ allowSample: true });
  if (!live.ready) {
    return respond(
      Response.json(
        { error: "live_search_unavailable", message: "Live search isn't switched on yet. You were not asked to pay.", missing: live.missing },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    );
  }

  const paid = withX402Payment({ description: "ProductRadar search: an 8-part product Dossier with cited evidence", priceUsdc: SEARCH_PRICE_USDC }, async () => {
    let data;
    try {
      data = await fetchDossierData(parsed.data.q, live.sources);
    } catch (e) {
      if (!(e instanceof SourceError || e instanceof BudgetExceededError)) throw e;
      return Response.json({ error: "source_unavailable", message: `${e.message} You were not charged.` }, { status: 502 });
    }
    if (data.ukListings.length === 0) {
      return Response.json({ error: "no_results", message: "No Amazon UK listings matched this search, so you were not charged." }, { status: 404 });
    }
    const dossier = buildDossier(
      {
        ...data,
        sample: live.sample,
        notes: [...(data.notes ?? []), ...(live.sample ? ["Development sample data: the supplier offers are made up."] : [])],
      },
      { id: paymentId, now: new Date() },
    );
    return Response.json(dossier, { headers: { "Cache-Control": "no-store" } });
  });

  return respond(await paid(request));
}
