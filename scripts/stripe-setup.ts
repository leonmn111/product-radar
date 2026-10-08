// Creates the "ProductRadar Pro" product and its £39/month price in Stripe.
// Safe to re-run: finds the existing price by its lookup key.
// Usage: npm run stripe:setup   (uses STRIPE_SECRET_KEY from .env — use a test key first)
import "dotenv/config";
import Stripe from "stripe";

const PRO = {
  lookupKey: "productradar_pro_monthly_gbp",
  productName: "ProductRadar Pro",
  description: "Live product ingestion and full access to live product intelligence.",
  currency: "gbp",
  unitAmount: 3900,
} as const;

(async () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Set STRIPE_SECRET_KEY in .env first (Stripe Dashboard → Developers → API keys).");
  const stripe = new Stripe(key);
  const mode = key.includes("_test_") ? "TEST" : "LIVE";

  const existing = await stripe.prices.list({ lookup_keys: [PRO.lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    const p = existing.data[0];
    console.log(`[${mode}] Pro price already exists: ${p.id} (${(p.unit_amount ?? 0) / 100} ${p.currency.toUpperCase()}/${p.recurring?.interval})`);
    return;
  }

  const product = await stripe.products.create({ name: PRO.productName, description: PRO.description });
  const price = await stripe.prices.create({
    product: product.id,
    currency: PRO.currency,
    unit_amount: PRO.unitAmount,
    recurring: { interval: "month" },
    lookup_key: PRO.lookupKey,
    transfer_lookup_key: true,
  });
  console.log(`[${mode}] Created ${PRO.productName}: product ${product.id}, price ${price.id} (£39.00/month).`);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
