// POST /api/stripe/webhook: the same Stripe webhook as /api/billing/webhook (subscriptions and credit
// packs, signature-verified with STRIPE_WEBHOOK_SECRET). Two addresses, one handler, so the endpoint
// already registered in the Stripe dashboard keeps working.
export { POST } from "@/app/api/billing/webhook/route";
