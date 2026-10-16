import { connection, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { bazaarManifest } from "@/server/payments/x402/discovery";

// GET /api/agent/v2/bazaar → the x402 Bazaar manifest: ProductRadar's paid endpoints, their live USDC
// terms and what each returns, in the x402 discovery format, so agents (and x402 directories) can find
// and call them. Public, free, readable from any origin.
export async function GET(request: NextRequest) {
  await connection();
  return Response.json(bazaarManifest(appUrl(request.nextUrl.origin)), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
