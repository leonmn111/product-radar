import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { METHODOLOGY_VERSION } from "@/server/scoring/engine";
import { listProducts } from "@/server/products/service";

const Query = z.object({
  category: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "category must be a lowercase slug, e.g. wireless-earbuds")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// GET /api/products?category=wireless-earbuds&limit=20
// Internal read endpoint: products ranked by latest OVERALL score, with the
// offers, evidence and per-dimension scores behind each one.
export async function GET(request: NextRequest) {
  await connection(); // request-time only, never prerendered

  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_query", issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }

  const products = await listProducts(db, parsed.data);

  return Response.json(
    {
      data: products,
      meta: {
        count: products.length,
        category: parsed.data.category ?? null,
        methodologyVersion: METHODOLOGY_VERSION,
        disclaimer:
          "Scores are calculated estimates (0–100) with a confidence (0–1), derived only from the linked evidence. They are not guarantees.",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
