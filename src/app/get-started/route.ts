import { connection } from "next/server";
import { liveSources } from "@/server/live/config";

// GET /get-started: every "Create a free account" button on the landing page. New accounts land in
// the Dossier terminal once live Dossiers are switched on; until then on the dashboard (the Pro offer),
// so nobody arrives at a page that can't do anything yet.
export async function GET() {
  await connection();
  const next = liveSources().ready ? "/terminal" : null;
  return new Response(null, {
    status: 303,
    headers: { Location: next ? `/signin?tab=register&callbackUrl=${encodeURIComponent(next)}` : "/signin?tab=register", "Cache-Control": "no-store" },
  });
}
