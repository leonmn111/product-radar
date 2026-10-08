// Stripe client and the Pro plan definition. Billing module only.

import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

export const PRO_PLAN = {
  lookupKey: "productradar_pro_monthly_gbp",
  productName: "ProductRadar Pro",
  description: "Live product ingestion and full access to live product intelligence.",
  currency: "gbp",
  unitAmount: 3900, // £39.00
  interval: "month",
} as const;

export class BillingNotConfiguredError extends Error {
  constructor(what = "STRIPE_SECRET_KEY") {
    super(`Billing isn't configured yet (${what} is missing).`);
  }
}

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new BillingNotConfiguredError();
  client ??= new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: "ProductRadar" } });
  return client;
}

export function appUrl(requestOrigin: string) {
  return (env.APP_URL ?? requestOrigin).replace(/\/+$/, "");
}

let cachedPriceId: string | null = null;
export async function proPriceId(): Promise<string> {
  if (cachedPriceId) return cachedPriceId;
  const prices = await stripe().prices.list({ lookup_keys: [PRO_PLAN.lookupKey], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new BillingNotConfiguredError("Pro price — run `npm run stripe:setup`");
  cachedPriceId = price.id;
  return price.id;
}
