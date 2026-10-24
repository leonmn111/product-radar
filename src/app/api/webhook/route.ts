// POST /api/webhook: the address the live Stripe webhook endpoint is registered at (Stripe dashboard ›
// Developers › Webhooks), so live payments reach the same signature-verified handler as /api/billing/webhook
// and /api/stripe/webhook. Without it, paid Pro subscriptions and credit packs were never confirmed here.
export { POST } from "@/app/api/billing/webhook/route";
