import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";
import { clientAddress } from "@/server/auth/password";
import { verifyUnlock } from "@/server/live/quickToken";
import { dbDossierCache } from "@/services/dossierCache";
import { dbLeadStore, FREE_BREAKDOWNS_PER_LEAD } from "@/services/leads";
import { quickBreakdown, quickVerdict, subjectFlags } from "@/services/quickVerdict";

// POST /api/free-verdict/unlock { token, email, marketing? } — the homepage check's email gate: records the
// email as a lead and returns the check's full breakdown (every cost line, the worst case, an ad-test plan).
// Rebuilt from the cached Dossier the signed token names: no data provider is called. Free for an email's
// first FREE_BREAKDOWNS_PER_LEAD products.

const DAY_MS = 24 * 60 * 60 * 1000;
const visitors = createRateLimiter({ windowMs: DAY_MS, max: 30 });
const noStore = { "Cache-Control": "no-store" };
const Body = z.object({
  token: z.string().min(10).max(4000),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")), // spaces from a phone keyboard are fine
  marketing: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  await connection();
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: noStore });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.find((i) => i.path[0] === "email");
    return json({ error: "invalid_request", message: emailIssue ? "Enter a valid email address." : "Run the check again, then unlock it." }, 400);
  }
  if (visitors.limited(clientAddress(request.headers) ?? "unknown")) {
    return json({ error: "too_many", message: "Too many unlocks from here today. Create a free account to keep going." }, 429);
  }

  const now = new Date();
  const claims = verifyUnlock(parsed.data.token, env.AUTH_SECRET, now);
  if (!claims) return json({ error: "expired", message: "This check has expired. Run it again to unlock its breakdown." }, 410);
  const dossier = await dbDossierCache.get(claims.asin, now);
  if (!dossier) return json({ error: "expired", message: "This check has expired. Run it again to unlock its breakdown." }, 410);

  const outcome = await dbLeadStore(db).unlock(parsed.data.email, `amazon.co.uk:${claims.asin}`, parsed.data.marketing === true, now);
  if (!outcome.ok) {
    return json(
      {
        error: "free_breakdowns_used",
        message: `You've had your ${FREE_BREAKDOWNS_PER_LEAD} free breakdowns. Get this product's full Pre-order Check for £29.`,
        signUp: `/signin?tab=register&callbackUrl=${encodeURIComponent(`/terminal?asin=${claims.asin}`)}`,
      },
      402,
    );
  }

  const pasted = claims.name ? { name: claims.name, brand: claims.brand } : null;
  const q = quickVerdict(dossier, subjectFlags(dossier, pasted), claims.supplier, now);
  const breakdown = quickBreakdown(dossier, q, claims.supplier, outcome.freeLeft);
  if (!breakdown) return json({ error: "expired", message: "The evidence behind this check has changed. Run it again to unlock its breakdown." }, 409);
  return json(breakdown, 200);
}
