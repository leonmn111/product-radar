// Stripe client. Billing module only. Plans and prices are in plans.ts (set inline at checkout, so
// nothing has to be created in the Stripe dashboard).

import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

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
