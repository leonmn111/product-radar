import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { shopifyCsv, shopifyHandle } from "@/components/dashboard/dossier";
import { db } from "@/lib/db";
import { canExportToShopify, getViewer } from "@/server/auth/entitlements";
import { getProduct } from "@/server/products/service";

// The wholesale cost typed into the dossier's profit calculator, e.g. a real supplier quote.
const Query = z.object({ cost: z.coerce.number().positive().max(1_000_000).optional() });

// GET /api/products/:id/shopify-csv?cost=12.50
// The dossier's "Download Shopify CSV": one product as a draft listing in Shopify's
// product import format, sent as a file download. Signed-out → 401, Free → 403.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/products/[id]/shopify-csv">) {
  await connection(); // request-time only, never prerendered

  const headers = { "Cache-Control": "private, no-store" };
  const query = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return Response.json({ error: "invalid_query", message: "cost must be a positive amount, e.g. 12.50." }, { status: 400, headers });
  }
  const { id } = await ctx.params;
  let product: Awaited<ReturnType<typeof getProduct>>;
  try {
    const viewer = await getViewer();
    if (!viewer) {
      return Response.json({ error: "unauthorized", message: "Sign in with a Pro account to export to Shopify." }, { status: 401, headers });
    }
    if (!canExportToShopify(viewer)) {
      return Response.json({ error: "pro_required", message: "The Shopify export is part of Pro." }, { status: 403, headers });
    }
    product = await getProduct(db, id);
  } catch (e) {
    console.error("[shopify-csv] query failed", e);
    return Response.json({ error: "internal_error", message: "Couldn't build the Shopify file." }, { status: 500, headers });
  }
  if (!product) return Response.json({ error: "not_found", message: "No product with that id." }, { status: 404, headers });

  const merchant = product.bestOffer?.merchant ?? null;
  return new Response(shopifyCsv({ ...product, merchant }, { costPerItem: query.data.cost }), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      // The handle is lowercase letters, digits and dashes only, so it is safe in the header.
      "Content-Disposition": `attachment; filename="${shopifyHandle({ name: product.name, merchant })}-shopify.csv"`,
    },
  });
}
