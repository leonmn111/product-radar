import "server-only";
import { z } from "zod";

// Server-side environment, validated once at startup so a missing or
// malformed variable fails loudly instead of surfacing as a vague DB error.
// Optional integrations (email, Stripe) may be empty: the features that need
// them report "not configured" instead of crashing the app.
const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

/** A whole number of 0 or more, with a default when unset. */
const count = (fallback: number) =>
  optional
    .transform((v) => (v === undefined ? fallback : Number(v)))
    .refine((n) => Number.isInteger(n) && n >= 0, { message: "must be a whole number, 0 or more" });

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .url()
      .refine((v) => v.startsWith("postgresql://") || v.startsWith("postgres://"), {
        message: "must be a postgresql:// connection string",
      }),
    AUTH_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -base64 32)"),
    AUTH_RESEND_KEY: optional,
    // Resend key for every email (receipts, alerts, sign-in, resets); falls back to AUTH_RESEND_KEY.
    // A "re_mock…" key prints emails instead of sending them (refused in production).
    RESEND_API_KEY: optional,
    EMAIL_FROM: z.string().trim().min(3).default("ProductRadar <onboarding@resend.dev>"),
    STRIPE_SECRET_KEY: optional.refine((v) => !v || /^(sk|rk)_(test|live)_/.test(v), {
      message: "must start with sk_test_ / sk_live_",
    }),
    STRIPE_WEBHOOK_SECRET: optional.refine((v) => !v || v.startsWith("whsec_"), { message: "must start with whsec_" }),
    APP_URL: optional.refine((v) => !v || /^https?:\/\//.test(v), { message: "must start with http(s)://" }),
    X402_MODE: z
      .enum(["mock", "facilitator"])
      .optional()
      .or(z.literal("").transform(() => undefined)),
    X402_NETWORK: z
      .enum(["eip155:84532", "eip155:8453"])
      .optional()
      .or(z.literal("").transform(() => undefined)),
    X402_FACILITATOR_URL: optional.refine((v) => !v || /^https:\/\//.test(v), { message: "must start with https://" }),
    X402_PAY_TO: optional.refine((v) => !v || /^0x[0-9a-fA-F]{40}$/.test(v), { message: "must be a 0x… wallet address" }),
    X402_PRICE_USDC: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,6})?$/, "must be a USDC amount like 0.01")
      .default("0.01"),
    // Live search (v2): Rainforest API key for Amazon US + UK (rainforestapi.com).
    RAINFOREST_API_KEY: optional,
    // Live search (v2): AliExpress Open Platform, Drop Shipping API (openservice.aliexpress.com).
    // The access token comes from the owner authorizing the app (30 days); the refresh token renews it
    // (60 days), and renewed pairs are kept in the database (ProviderToken). The expiry times are ISO.
    ALIEXPRESS_APP_KEY: optional,
    ALIEXPRESS_APP_SECRET: optional,
    ALIEXPRESS_ACCESS_TOKEN: optional,
    ALIEXPRESS_REFRESH_TOKEN: optional,
    ALIEXPRESS_TOKEN_EXPIRES_AT: optional.refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "must be an ISO date-time" }),
    ALIEXPRESS_REFRESH_EXPIRES_AT: optional.refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "must be an ISO date-time" }),
    // Free verdicts from the landing page's paste box (no account): each live check spends provider credits,
    // so they're capped site-wide per UTC day and per visitor (IP, per server process) per 24 hours.
    // Cached products don't count against the site-wide cap. 0 switches free checks off.
    FREE_VERDICTS_PER_DAY: count(20),
    FREE_VERDICTS_PER_VISITOR: count(3), // the homepage promises a full breakdown free for the first 3
    // A new account's free first Dossier (its WELCOME credits): at most this many accounts a UTC day get one,
    // site-wide, so fake sign-ups can't run up provider costs. 0 switches the welcome off.
    WELCOME_DOSSIERS_PER_DAY: count(50),
    // Keepa API key (keepa.com, a paid plan): Amazon UK price and sales-rank history for Momentum.
    // Without it, Momentum is withheld and says the history is missing.
    KEEPA_API_KEY: optional,
    // Meta Ad Library API (free): a user access token from an identity-confirmed Meta developer account,
    // for the Viral Demand Engine (src/services/metaAds.ts). Long-lived user tokens last about 60 days.
    // Missing or a placeholder (e.g. TEMP_WAITING_ON_META): ad data reads "Ad data pending Meta approval".
    META_AD_LIBRARY_ACCESS_TOKEN: optional,
    // Development only: "on" runs the live-search page on recorded/sample responses (no provider
    // calls, no cost). Refused in production; locally the paid API uses it too, flagged as sample.
    LIVE_SAMPLE_DATA: optional,
    // "on" sells credit packs through /api/stripe/checkout with a live Stripe key. Off by default: until
    // then they're sold only in Stripe test mode, outside production. The Agency plan follows the same switch.
    CREDIT_PACKS_ON_SALE: optional,
    // Coinbase Developer Platform API key, for the Coinbase facilitator (Base mainnet). The secret is an
    // Ed25519 key (base64) or an EC key (PEM); a PEM pasted on one line with literal "\n"s is unfolded.
    CDP_API_KEY_ID: optional,
    CDP_API_KEY_SECRET: optional.transform((v) => v?.replace(/\\n/g, "\n")),
  });

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment variables (see .env.example):\n${issues}`);
}

export const env = parsed.data;
