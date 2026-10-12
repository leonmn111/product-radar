import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { clientAddress, RegisterInput, registerLimits, registerUser } from "@/server/auth/password";

// POST /api/auth/register  { "email": "...", "password": "..." }
// Creates an email + password account. It doesn't sign in: clients then sign in
// through Auth.js (the /signin page does both in one step).
export async function POST(request: NextRequest) {
  // JSON only: a cross-site <form> can't send it without a CORS preflight, which this route never allows.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "unsupported_media_type", message: "Send JSON." }, { status: 415 });
  }
  const client = clientAddress(request.headers);
  if (client && registerLimits.perClient.limited(client)) {
    return Response.json(
      { error: "rate_limited", message: "Too many accounts created from this connection. Try again in an hour." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }
  const parsed = RegisterInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_input", issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  const result = await registerUser(db, parsed.data);
  if (!result.ok) {
    return Response.json({ error: "email_taken", message: "An account with this email already exists." }, { status: 409 });
  }
  return Response.json({ ok: true }, { status: 201 });
}
