import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOpportunities } from "@/server/opportunities/service";
import { withX402Payment } from "@/server/payments/x402/middleware";

const Query = z.object({
  category: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "category must be a lowercase slug, e.g. earplugs")
    .optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  includeSample: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

// GET /api/agent/v1/opportunity?category=earplugs&limit=10
// Ranked product opportunities for AI agents, paid per request via x402.
// The handler below is pure domain logic; payment is handled by the wrapper.
export const GET = withX402Payment(
  { description: "ProductRadar ranked product opportunities with evidence-backed scores" },
  async (request: NextRequest) => {
    const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      // Non-2xx ⇒ the payment middleware releases the authorization: no charge.
      return Response.json(
        { error: "invalid_query", issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }
    return Response.json(await getOpportunities(db, parsed.data));
  },
);
