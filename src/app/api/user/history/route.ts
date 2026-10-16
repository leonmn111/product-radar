import { connection } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { userLibrary } from "@/services/library";

// GET /api/user/history → { items: LibraryEntry[] }: the signed-in user's Dossiers, newest purchase
// first. Only theirs: the list starts from the user's own credit ledger (the session's user id), so
// nobody else's purchases can appear. Wallet (x402) purchases aren't tied to an account and reopen
// with Sign-In-With-X instead.
export async function GET() {
  await connection();
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "unauthenticated", message: "Sign in to see your Dossiers." }, { status: 401 });
  const items = await userLibrary(db, viewer.id);
  return Response.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
