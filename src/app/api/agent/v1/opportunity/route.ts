import { opportunitySearch } from "@/server/opportunities/http";
import { withX402Payment } from "@/server/payments/x402/middleware";

// GET /api/agent/v1/opportunity?q=wireless+earbuds&category=gadgets&limit=10
// Ranked product opportunities for AI agents, paid per request via x402 (USDC on Base). The handler is pure
// domain logic (server/opportunities/http.ts); payment is handled by the wrapper, and a non-2xx answer (a bad
// query, no results) releases the payment: no charge.
export const GET = withX402Payment({ description: "ProductRadar ranked product opportunities with evidence-backed scores" }, opportunitySearch);
