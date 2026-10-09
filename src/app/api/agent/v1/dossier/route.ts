import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDossier } from "@/server/opportunities/dossier";
import { withX402Payment } from "@/server/payments/x402/middleware";

const Query = z.object({
  productId: z.uuid("productId must be a product id from /api/agent/v1/opportunity"),
});

// GET /api/agent/v1/dossier?productId=<uuid>
// The full Opportunity Dossier for one product (verdict, scores, profit estimate,
// supplier search, every cited source), paid per request via x402.
// The handler below is pure domain logic; payment is handled by the wrapper.
export const GET = withX402Payment(
  { description: "ProductRadar Opportunity Dossier: verdict, scores, profit estimate and cited evidence for one product" },
  async (request: NextRequest) => {
    const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      // Non-2xx ⇒ the payment middleware releases the authorization: no charge.
      return Response.json(
        { error: "invalid_query", issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }
    const dossier = await getDossier(db, parsed.data.productId);
    if (!dossier) {
      return Response.json({ error: "not_found", message: "No product with that id." }, { status: 404 });
    }
    return Response.json(dossier);
  },
);
