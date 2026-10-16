import { connection, type NextRequest } from "next/server";
import { ExportUnavailableError, generateShopifyCSV } from "@/engine/exports";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { paidCreditReferences } from "@/server/billing/credits";
import { HEADER_SIWX, signInRequired, walletPurchase } from "@/server/payments/x402/siwx";
import { dossierIdsFor, loadDossier } from "@/services/dossierStore";
import type { Dossier } from "@/types/dossier";

const noStore = { "Cache-Control": "private, no-store" };

// GET /api/agent/v2/dossier/B0CH33F5P2/export/csv → the Dossier as a Shopify product import file,
// for whoever bought it: a signed-in person who paid credits for it, or (Sign-In-With-X) the wallet
// that paid USDC for /api/agent/v2/dossier/B0CH33F5P2. It's the copy they were sold. Free to download;
// nothing is fetched again. Built only from shown parts: a withheld margin means no file (409).
export async function GET(request: NextRequest, { params }: { params: Promise<{ asin: string }> }) {
  await connection();
  const asin = (await params).asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return Response.json({ error: "invalid_asin", message: "Use a 10-character Amazon UK ASIN, e.g. B0CH33F5P2." }, { status: 400, headers: noStore });
  }

  let dossier: Dossier | null = null;
  // A person who paid credits for a Dossier of this product: their newest one.
  const viewer = await getViewer();
  if (viewer) {
    const [owned] = await paidCreditReferences(db, viewer.id, await dossierIdsFor(asin));
    if (owned) dossier = await loadDossier(owned);
  }
  // An agent's wallet that bought it over x402.
  let walletError: string | undefined;
  if (!dossier && request.headers.has(HEADER_SIWX)) {
    const purchase = await walletPurchase(request, `/api/agent/v2/dossier/${asin}`);
    if (purchase.ok) dossier = await loadDossier(purchase.reference);
    else walletError = purchase.reason;
  }

  if (!dossier) {
    if (viewer && !walletError) {
      return Response.json(
        { error: "not_owned", message: `You haven't bought the Dossier for ${asin} yet. Run it in the Dossier terminal first.` },
        { status: 403, headers: noStore },
      );
    }
    return signInRequired(
      request,
      `Shopify export of the ProductRadar Dossier for ${asin}`,
      walletError ?? "not_owned",
      "Sign in with the wallet that bought this Dossier (Sign-In-With-X), or to ProductRadar with the account that paid for it.",
    );
  }

  let csv: string;
  try {
    csv = generateShopifyCSV(dossier);
  } catch (e) {
    if (!(e instanceof ExportUnavailableError)) throw e;
    return Response.json({ error: "export_unavailable", message: e.message }, { status: 409, headers: noStore });
  }
  return new Response(csv, {
    headers: {
      ...noStore,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="productradar-${asin}-shopify.csv"`,
    },
  });
}
