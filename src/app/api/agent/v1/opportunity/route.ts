import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOpportunities } from "@/server/opportunities/service";
import { withX402Payment } from "@/server/payments/x402/middleware";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

const Query = z.object({
  q: optionalText(200),
  category: optionalText(100),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  includeSample: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

// GET /api/agent/v1/opportunity?q=wireless+earbuds&category=gadgets&limit=10
// Ranked product opportunities for AI agents, paid per request via x402.
// `q` searches names, brands, categories and descriptions in plain words.
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
    const result = await getOpportunities(db, parsed.data);
    if (result.count === 0) {
      // Non-2xx ⇒ no charge: an agent never pays for an empty answer. The message
      // carries the categories, since MCP clients show only `message` on errors.
      return Response.json({ error: "no_results", message: result.hint, ...result }, { status: 404 });
    }
    return Response.json(result);
  },
);
