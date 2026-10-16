// POST /api/stripe/webhook: the same Stripe webhook as /api/billing/webhook, signature-verified with
// STRIPE_WEBHOOK_SECRET. Subscriptions set the user's tier; a paid credit pack is written to
// PostgreSQL (User.platformCredits plus a CreditLedgerEntry, in one transaction, once per Checkout
// Session; src/server/billing/credits.ts). Two addresses, one handler, so the endpoint already
// registered in the Stripe dashboard keeps working.
export { POST } from "@/app/api/billing/webhook/route";
