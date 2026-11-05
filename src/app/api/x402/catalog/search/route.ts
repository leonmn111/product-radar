import { connection, type NextRequest } from "next/server";
import { opportunitySearch } from "@/server/opportunities/http";
import { withUsageBilling } from "@/server/payments/x402/billingHttp";

// GET /api/x402/catalog/search?q=wireless+earbuds&category=gadgets&limit=10 with Authorization: Bearer <API key>
// The catalog's ranked product opportunities for AI agents, billed in Solana USDC for actual usage: $0.05 a
// search that finds something (an empty one is free), settled daily or at $5. Same answers as
// /api/agent/v1/opportunity; only the payment differs (server/payments/x402/billingHttp.ts).
const billed = withUsageBilling("GET /api/x402/catalog/search", opportunitySearch);

export async function GET(request: NextRequest) {
  await connection();
  return billed(request);
}
