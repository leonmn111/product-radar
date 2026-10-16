import { connection, type NextRequest } from "next/server";

// GET /api/agent/v2/dossier?asin=B0CH33F5P2 (or ?productId=…) → 308 to /api/agent/v2/dossier/B0CH33F5P2,
// the one address each Dossier is bought and reopened at.
export async function GET(request: NextRequest) {
  await connection();
  const id = (request.nextUrl.searchParams.get("asin") ?? request.nextUrl.searchParams.get("productId") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(id)) {
    return Response.json(
      { error: "invalid_asin", message: "Pass ?asin= with a 10-character Amazon UK ASIN (e.g. B0CH33F5P2), or call /api/agent/v2/dossier/{asin}." },
      { status: 400 },
    );
  }
  return Response.redirect(new URL(`/api/agent/v2/dossier/${id}`, request.nextUrl), 308);
}
