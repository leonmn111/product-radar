import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { simulatedImageMatcher } from "@/engine/imageMatch";
import { liveSources } from "@/server/live/config";
import { isSourceFailure, reportSourceFailure, RETRY_AFTER_SECONDS } from "@/server/live/unavailable";
import { DOSSIER_PRICE_USDC, newPaymentIdentifier, withDiscoveryHeaders } from "@/server/payments/x402/discovery";
import { withX402Payment } from "@/server/payments/x402/middleware";
import { HEADER_SIWX } from "@/server/payments/x402/siwx";
import { dbDossierCache } from "@/services/dossierCache";
import { getProductDossier } from "@/services/dossierService";
import { loadDossier, saveDossier } from "@/services/dossierStore";

// A wallet reopening a Dossier it bought (Sign-In-With-X) pays nothing.
const REOPEN_PRICE_USDC = "0.00";

const Asin = z.string().regex(/^[A-Z0-9]{10}$/, "asin must be a 10-character Amazon ASIN, e.g. B0CH33F5P2");

// GET /api/agent/v2/dossier/B0CH33F5P2
// The 8-part Dossier for one Amazon UK product: its product page (price, brand, seller), other
// listings of it, and supplier matches. $2 USDC over x402, served from the 48-hour cache when a fresh
// copy exists (X-Dossier-Cache: hit, no provider calls). A wallet that already bought this Dossier
// reopens it free with Sign-In-With-X (x402-price "0.00"), served from the copy delivered to it.
// Every response carries the x402 discovery headers.
export async function GET(request: NextRequest, { params }: { params: Promise<{ asin: string }> }) {
  await connection();
  const paymentId = newPaymentIdentifier();
  let reopenedId: string | null = null;
  const respond = (res: Response) =>
    withDiscoveryHeaders(res, reopenedId ? REOPEN_PRICE_USDC : DOSSIER_PRICE_USDC, reopenedId ?? paymentId);

  const raw = (await params).asin.trim();
  const parsed = Asin.safeParse(raw.toUpperCase());
  if (!parsed.success) {
    return respond(Response.json({ error: "invalid_asin", message: parsed.error.issues[0].message }, { status: 400 }));
  }
  const asin = parsed.data;
  // One address per Dossier: purchases (and reopening them) are keyed by this exact path.
  if (raw !== asin) return Response.redirect(new URL(`/api/agent/v2/dossier/${asin}`, request.nextUrl), 308);

  // Development sample data is allowed outside production only (liveSources refuses it in production).
  const live = liveSources({ allowSample: true });
  // A returning buyer doesn't need live sources: their Dossier is served from storage.
  if (!live.ready && !request.headers.has(HEADER_SIWX)) {
    return respond(
      Response.json(
        { error: "live_search_unavailable", message: "Live Dossiers aren't switched on yet. You were not asked to pay.", missing: live.missing },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    );
  }

  const paid = withX402Payment(
    {
      description: `ProductRadar Standard Dossier for Amazon UK product ${asin}, with cited evidence`,
      priceUsdc: DOSSIER_PRICE_USDC,
      reference: paymentId,
      signInWithX: {
        async reopen(reference) {
          const dossier = await loadDossier(reference);
          if (!dossier) return null;
          reopenedId = dossier.id;
          return Response.json(dossier, { headers: { "Cache-Control": "no-store" } });
        },
      },
    },
    async () => {
      if (!live.ready) {
        return Response.json({ error: "live_search_unavailable", message: "Live Dossiers aren't switched on yet. You were not charged." }, { status: 503 });
      }
      let result;
      try {
        result = await getProductDossier(asin, {
          sources: live.sources,
          cache: dbDossierCache,
          sample: live.sample,
          notes: live.sample ? ["Development sample data: the supplier offers are made up."] : [],
          // Image similarity is simulated until a real matcher exists, so it only ever runs on sample data.
          imageMatcher: live.sample ? simulatedImageMatcher : undefined,
          id: paymentId,
        });
      } catch (e) {
        // A source that fails (e.g. AliExpress with a lapsed token) aborts the Dossier: 503, not charged.
        if (!isSourceFailure(e)) throw e;
        return Response.json(
          {
            error: "source_unavailable",
            message: `${reportSourceFailure("v2/dossier", e)} You were not charged; try again in a few minutes.`,
          },
          { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": String(RETRY_AFTER_SECONDS) } },
        );
      }
      if (!result) {
        return Response.json({ error: "no_product", message: `Amazon UK has no priced product ${asin}, so you were not charged.` }, { status: 404 });
      }
      const { dossier } = result;
      await saveDossier(dossier); // before answering: if it can't be kept, the request fails and isn't charged
      return Response.json(dossier, { headers: { "Cache-Control": "no-store", "X-Dossier-Cache": result.cache } });
    },
  );

  return respond(await paid(request));
}
