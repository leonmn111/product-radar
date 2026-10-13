import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canViewCatalog, getViewer } from "@/server/auth/entitlements";
import { listProducts } from "@/server/products/service";
import { METHODOLOGY_VERSION } from "@/server/scoring/engine";

const Query = z.object({
  category: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "category must be a lowercase slug, e.g. wireless-earbuds")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// GET /api/products?category=wireless-earbuds&limit=20
// The Pro catalog behind /dashboard: products (live and sample) ranked by latest OVERALL score, with the
// offers, evidence and per-dimension scores behind each one. Signed-out → 401, Free → 403.
export async function GET(request: NextRequest) {
  await connection(); // request-time only, never prerendered

  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_query", issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }

  const headers = { "Cache-Control": "private, no-store" };
  let products: Awaited<ReturnType<typeof listProducts>>;
  try {
    const viewer = await getViewer();
    if (!viewer) {
      return Response.json({ error: "unauthorized", message: "Sign in with a Pro account to see the catalog." }, { status: 401, headers });
    }
    if (!canViewCatalog(viewer)) {
      return Response.json({ error: "pro_required", message: "The product catalog is part of Pro." }, { status: 403, headers });
    }
    products = await listProducts(db, { ...parsed.data, includeLive: true });
  } catch (e) {
    console.error("[products] query failed", e);
    return Response.json({ error: "internal_error", message: "Couldn't load products." }, { status: 500, headers });
  }

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
    { headers },
  );
}
