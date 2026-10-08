import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canViewLiveData, getViewer } from "@/server/auth/entitlements";
import { countHiddenLiveProducts, listProducts } from "@/server/products/service";
import { METHODOLOGY_VERSION } from "@/server/scoring/engine";

const Query = z.object({
  category: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "category must be a lowercase slug, e.g. wireless-earbuds")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// GET /api/products?category=wireless-earbuds&limit=20
// Read endpoint (sample data for everyone; live data for Pro): products ranked by latest OVERALL score, with the
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

  // Free and signed-out viewers see the seeded sample data only; live data is Pro.
  const includeLive = canViewLiveData(await getViewer());
  const [products, hiddenLiveCount] = await Promise.all([
    listProducts(db, { ...parsed.data, includeLive }),
    includeLive ? 0 : countHiddenLiveProducts(db, parsed.data.category),
  ]);

  return Response.json(
    {
      data: products,
      meta: {
        count: products.length,
        category: parsed.data.category ?? null,
        access: includeLive ? "full" : "sample_only",
        hiddenLiveCount,
        methodologyVersion: METHODOLOGY_VERSION,
        disclaimer:
          "Scores are calculated estimates (0–100) with a confidence (0–1), derived only from the linked evidence. They are not guarantees.",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
