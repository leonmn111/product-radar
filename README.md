# ProductRadar

Next.js (App Router) · TypeScript · PostgreSQL · Prisma 7 · Zod · Tailwind CSS.
Architecture rules live in [CLAUDE.md](./CLAUDE.md).

## First-time setup

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # already done locally; edit if your DB differs
npm run db:start            # terminal 1: local Postgres (leave running)
npm run db:migrate          # terminal 2: apply migrations
npm run db:seed             # optional: 5 sample products with scores
npm run dev                 # http://localhost:3000
```

Check it works: open http://localhost:3000/api/health

## Scripts

| Command | What it does |
| --- | --- |
| `npm run db:start` | Runs a real PostgreSQL 18 server locally (no Docker/Homebrew). Data lives in `.postgres-data/`. |
| `npm run db:migrate` | Dev: create a new migration from `prisma/schema.prisma` changes, apply it, and regenerate the client. |
| `npm run db:deploy` | Production: apply pending migrations only (never creates new ones). |
| `npm run db:status` | Show which migrations are applied. |
| `npm run db:studio` | Browse the database in a web UI. |
| `npm run db:verify` | Tries to break every data rule against the real database and reports pass/fail. Cleans up after itself. |
| `npm run db:seed` | Replace sample products (fictional brands, example.com sources) and calculate their scores. Refuses to run in production. |
| `npm run db:rescore` | Recalculate scores for every category (e.g. after a formula change). History is kept. |
| `npm run stripe:setup` | Create the Pro product + £39/month price in Stripe (uses `STRIPE_SECRET_KEY`). |
| `npm test` | Unit tests for scoring, ingestion and billing. |
| `npm run typecheck` / `npm run lint` | Static checks. |
| `npm run build` | Production build. |

## Health endpoint

`GET /api/health`

- **200** `{"status":"ok", ...}` — database reachable, migrations applied cleanly.
- **503** `{"status":"degraded"}` — database reachable but migrations not run or one failed.
- **503** `{"status":"error"}` — database unreachable. (Error detail is shown only outside production.)

## Dashboard

`http://localhost:3000/` — ranked product table (cards on phones). Filter by category, sort by any score or price,
and open a product to see its score breakdown, offers and every piece of evidence with the scores it fed into.
Data comes from `/api/products` in the browser. Components live in `src/components/dashboard/`.
The page is marked `noindex` (it's an app dashboard, not a marketing page).

## Accounts & plans

| | Signed out / Free | Pro (£39/month) |
| --- | --- | --- |
| View sample data | ✓ | ✓ |
| View live products | — (count shown as a teaser) | ✓ |
| Submit product URLs (`/api/ingest`) | — (401 / 403) | ✓ |

- **Sign-in:** passwordless email links (Auth.js v5, database sessions). In development, with no
  `AUTH_RESEND_KEY`, the link is printed in the terminal running `npm run dev`. In production set
  `AUTH_RESEND_KEY` (resend.com, free tier) and an `EMAIL_FROM` on a domain you've verified in Resend.
- **Plan checks** live in `src/server/auth/entitlements.ts` and only read `User.subscriptionTier`.
- **Billing** (Stripe) is isolated in `src/server/billing/` and is the only code that writes the
  `stripe*` / `subscription*` fields on `User`.
  - `/upgrade` → sign in if needed → Stripe Checkout (or the billing portal if already Pro)
  - `/billing/manage` → Stripe customer portal (card, invoices, cancel)
  - `/billing/success` → confirms the checkout with Stripe and unlocks Pro immediately
  - `POST /api/billing/webhook` → signature-verified; applies `customer.subscription.*` events,
    ignores out-of-order (older) events. `active`, `trialing`, `past_due` ⇒ Pro; anything else ⇒ Free.

### Turning on Stripe (test mode first)

1. Create a Stripe account → Developers → API keys → copy the **test** secret key into `.env` as `STRIPE_SECRET_KEY`.
2. `npm run stripe:setup` — creates the "ProductRadar Pro" product and £39/month price (safe to re-run).
3. Webhook: in production add an endpoint `https://<your-site>/api/billing/webhook` in Stripe → Developers →
   Webhooks, listening to `customer.subscription.created`, `.updated`, `.deleted` and
   `checkout.session.completed`; copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
   Locally you can skip this — the success page confirms the payment directly — or use the Stripe CLI
   (`stripe listen --forward-to localhost:3000/api/billing/webhook`).
4. Stripe → Settings → Billing → Customer portal: click **Save** once so the "Billing" button works.
5. Test card: `4242 4242 4242 4242`, any future date, any CVC.

## Live ingestion

Paste a product URL into **New opportunity URL** on the dashboard (or `POST /api/ingest`
`{"url": "...", "category": "running-shoes"}`). The server:

1. Fetches the page safely — public http(s) only, private/internal addresses blocked on every redirect,
   robots.txt respected, 10 s timeout, 3 MB cap, max 10 requests/minute per client.
2. Extracts only what the store publishes for machines (schema.org JSON-LD › Open Graph › microdata › `<title>`):
   title, brand, description, image, price + currency + stock, rating, review count. **Prices are never guessed
   from page text**; no currency ⇒ no offer. Pages that don't declare a product (homepages, bot-check pages) are rejected.
3. Saves a live Product (keyed by its canonical URL — resubmitting updates it) plus Evidence for each fact and an
   Offer for the price. Evidence quality: JSON-LD 80, microdata 70, Open Graph 65, `<title>` 40; seller-hosted
   ratings capped at 60.
4. Recalculates scores for the whole category.

Code: `src/server/ingest/` (`fetch-page.ts`, `extract.ts`, `ingest.ts`) and `src/app/api/ingest/route.ts`.
Many large retailers (Amazon, REI, Brooks…) block automated readers and return an error; independent stores
(Shopify, WooCommerce) usually work.

## Products endpoint

`GET /api/products?category=wireless-earbuds&limit=20`

Products ranked by latest OVERALL score. Each includes `bestOffer`, `scores` (latest per dimension, with
`confidence`, `methodologyVersion` and the `evidenceIds` used), `offers`, and `evidence` (source, timestamp,
quality score, metric). `category` must be a lowercase slug; `limit` is 1–50 (default 20). Invalid input → 400.
Signed-out and Free viewers get sample products only (`meta.access = "sample_only"`, with `meta.hiddenLiveCount`).

## Scoring engine

`src/server/scoring/engine.ts` — pure math, no AI, no randomness: identical evidence and date always give identical
scores. Full formulas are in the file header. In short:

- Each piece of evidence is weighted by its quality score, its age (halves every 90 days) and its source type.
- QUALITY (star ratings), SENTIMENT, DEMAND (review counts + search interest), TREND (search-interest slope),
  VALUE (quality vs. price relative to the category median), OVERALL (weighted blend).
- Thin evidence is pulled toward a neutral 50 and gets low confidence. No usable evidence → no score at all.
- Re-captures of the same rating/review count/sentiment from the same source count once (latest wins), so
  resubmitting a page can't inflate its score. Search-interest captures are all kept for TREND.
- `src/server/scoring/service.ts` loads data, runs the engine per category, and stores scores with links to
  their evidence (history is kept).

## Data model

| Model | Purpose |
| --- | --- |
| `User` | Account with a `subscriptionTier` (FREE / PRO / BUSINESS). Entitlement only — no payment data. |
| `Product` | A tracked product. `category` is a lowercase slug, e.g. `kitchen-appliances`. |
| `Evidence` | One sourced fact about a product. **Required:** `sourceUrl`, `sourceName`, `sourceType`, `observedAt`, `qualityScore` (0–100). Optional `metric` + `metricValue` (RATING 0–5, REVIEW_COUNT, SENTIMENT −1–1, SEARCH_INTEREST 0–100) feed the scoring engine. |
| `Offer` | A seller's price/availability. Must cite an `Evidence` row for the same product. |
| `ProductScore` | A calculated estimate (0–100) with `confidence` (0–1) and `methodologyVersion`. History is kept. |
| `ProductScoreEvidence` | Links each score to the evidence it was computed from. |

Rules are enforced twice: Zod validators in `src/lib/validation/evidence.ts` (readable errors) and
CHECK constraints in the migration SQL (the database refuses bad data even if code skips validation).
Evidence that an offer or score cites cannot be deleted on its own.

## Environment variables

Validated at startup by `src/lib/env.ts` — the app refuses to start with a missing/invalid value.

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/db` |
| `AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | self-hosting | `true` when running `next start` yourself |
| `AUTH_RESEND_KEY` | production | Sends sign-in emails. Empty in dev ⇒ link printed to terminal. |
| `EMAIL_FROM` | production | e.g. `ProductRadar <login@yourdomain.com>` |
| `STRIPE_SECRET_KEY` | for billing | `sk_test_…` first, `sk_live_…` when ready |
| `STRIPE_WEBHOOK_SECRET` | for billing | `whsec_…` |
| `APP_URL` | optional | Public URL for Stripe redirects; defaults to the request's address |

## Layout

```
prisma/schema.prisma        database models (add per vertical slice)
prisma/migrations/          versioned SQL migrations (commit these)
src/lib/env.ts              validated environment
src/lib/db.ts               shared Prisma client
src/lib/validation/         Zod input validators
src/server/scoring/         scoring engine (pure) + service (DB) + tests
src/server/products/        product read model for the API
src/app/api/products/       products endpoint
src/components/dashboard/   dashboard UI (URL bar, table, cards, evidence panel)
src/server/ingest/          live URL ingestion (safe fetch, extraction, storage)
src/auth.ts                 Auth.js config (email sign-in links)
src/server/auth/            plan checks (entitlements)
src/server/billing/         Stripe: checkout, portal, webhook, subscription sync
src/app/signin/             sign-in pages
src/app/upgrade, billing/   upgrade, manage-billing and success routes
src/app/api/ingest/         ingestion endpoint
prisma/seed.ts              sample data
src/app/api/health/route.ts health check
scripts/db-start.mjs        local Postgres runner
scripts/verify-schema.ts    data-rule checks (npm run db:verify)
```

Payments (x402) are intentionally not implemented yet and must stay isolated from core logic.
