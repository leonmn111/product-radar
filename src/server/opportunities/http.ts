// The opportunity search as an HTTP handler, shared by the paid agent routes: x402 on Base
// (/api/agent/v1/opportunity) and x402 Tier 2, Solana usage billing (/api/x402/catalog/search). Domain code:
// it knows nothing about how the caller pays. A non-2xx answer (a bad query, no results) is never charged.

import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOpportunities } from "./service";

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

/** GET ?q=wireless+earbuds&category=gadgets&limit=10: `q` searches names, brands, categories and descriptions in plain words. */
export async function opportunitySearch(request: NextRequest): Promise<Response> {
  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_query", issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  const result = await getOpportunities(db, parsed.data);
  if (result.count === 0) {
    // No charge for an empty answer. The message carries the categories, since MCP clients show only `message` on errors.
    return Response.json({ error: "no_results", message: result.hint, ...result }, { status: 404 });
  }
  return Response.json(result);
}
