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
| `npm run products:import -- <list.json>` | Import real products from a list of store pages, each with optional extra sources (other stores, expert reviews). See "Bulk import" below. |
| `npm run fx:update` | Refresh the ECB euro reference rates in `src/server/scoring/fx-rates.json` (used only to compare prices across currencies). Commit, deploy, then rescore. |
| `npm run trends:enrich -- <keywords.json> [--dry-run] [--limit N] [--only text]` | Add Google search-interest evidence (Google Trends via SerpApi) to real products and rescore them. See "Search interest" below. |
| `npm run stripe:setup` | Create the Pro product + £39/month price in Stripe (uses `STRIPE_SECRET_KEY`). |
| `npm run agent:test` | Mock AI agent: full x402 402 → pay → 200 flow plus abuse checks against a running server. |
| `npm run mcp:build` | Bundle the MCP server (`mcp/`) and pack it into `public/mcp/` for download. |
| `npm test` | Unit tests for scoring, ingestion, billing, x402 verification/facilitator and the agent dossier. |
| `npm run typecheck` / `npm run lint` | Static checks. |
| `npm run build` | Production build. |

## Health endpoint

`GET /api/health`

- **200** `{"status":"ok", ...}` — database reachable, migrations applied cleanly.
- **503** `{"status":"degraded"}` — database reachable but migrations not run or one failed.
- **503** `{"status":"error"}` — database unreachable. (Error detail is shown only outside production.)

## Dashboard

`http://localhost:3000/` — ranked product cards (`product-card.tsx`): square photo from `Product.imageUrl` (plain
`<img>`, lazy, no referrer; a brand-monogram tile when there's no photo or it fails to load), brand, title, overall
score with its confidence badge, best current price, the Value score, and "N sources" (distinct pages, over all
evidence) plus "Trends" when Google search-interest data exists. On wide screens a Cards / Table switch keeps the
full score table. Filter by category, sort by any score or price, and open a product's dossier (the card widens to
the full row) to see its verdict, profit calculator, score breakdown, offers and every piece of evidence.
Data comes from `/api/products` in the browser. Components live in `src/components/dashboard/`.
The page is marked `noindex` (it's an app dashboard, not a marketing page).

## Deploying (Railway)

Live at https://theproductradar.io (also https://web-production-4e971.up.railway.app; project `product-radar`: services `web` + `Postgres`).

Deploy settings are stored on the Railway `web` service (not in a repo file — Railway retired
`railway.json` on 2026-12-01 and ignored it for CLI uploads):

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Pre-deploy command | `npx prisma migrate deploy` |
| Start command | `npm run start` (Next.js reads Railway's `PORT`) |
| Health check | `/api/health` (120 s) — a release only goes live once the database is reachable |
| Restart policy | on failure, 5 retries |

Deploy from this folder with `railway up --service web --detach` (needs a project token in `RAILWAY_TOKEN`).
`.railwayignore` keeps `.env` and local data out of uploads.

Service variables on `web`: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`,
`AUTH_RESEND_KEY`, `EMAIL_FROM`, `APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. For agent payments add
`X402_MODE=facilitator` and `X402_PAY_TO` (your wallet); never `mock` in production.

## Accounts & plans

| | Signed out / Free | Pro (£39/month) |
| --- | --- | --- |
| View sample data | ✓ | ✓ |
| View live products | — (count shown as a teaser) | ✓ |
| Submit product URLs (`/api/ingest`) | — (401 / 403) | ✓ |

- **Sign-in** (Auth.js v5, `/signin` with "Sign in" / "Create account" tabs): email + password, or a
  one-time email link. In development, with no `AUTH_RESEND_KEY`, the link is printed in the terminal
  running `npm run dev`. In production set `AUTH_RESEND_KEY` (resend.com, free tier) and an `EMAIL_FROM` on
  a domain you've verified in Resend.
  - Sessions are signed cookies (JWT, 30 days) because Auth.js needs that for passwords; the session
    callback still reads `subscriptionTier` from the database on every request, so plan changes apply at once.
  - Passwords: bcrypt (10 rounds), 8–72 characters (bcrypt ignores bytes past 72, so longer ones are refused).
    Code: `src/server/auth/password.ts`; UI actions: `src/app/signin/actions.ts`.
  - `POST /api/auth/register` `{ "email", "password" }` (JSON only) → 201, 400, 409 (email taken), 429.
  - Registering never adds a password to an existing account. A password set while the address is
    unverified is dropped the first time an email link for that address is used, so nobody can register a
    stranger's address and later share the account the real owner signs into by email.
  - Limits (per server process): 10 password attempts per email and 50 per client per 15 minutes;
    10 registrations per client per hour.
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

## Agent API (x402)

Public docs for developers and agents: **`/docs`** (always dark; price, network and the example 402 come
from the live payment config).

- `GET /api/agent/v1/opportunity?q=wireless+earbuds&category=gadgets&limit=10&includeSample=false` — ranked
  product opportunities: rank, opportunity score + confidence, per-dimension scores, best offer, and the top
  evidence (source URL, timestamp, quality score) behind each product. `q` is a plain-words search over
  name, brand, category and description (word starts, any case, plurals, British/American spelling;
  products matching more words rank first, each lists `matchedWords`). `category` filters only when it
  names a category with products; anything else is searched like `q`. Every response lists
  `availableCategories`. No matches → 404 `no_results` with a hint, and no charge.
- `GET /api/agent/v1/dossier?productId=<uuid>` — the full Opportunity Dossier for one product: rule-based
  verdict + confidence, every score with its evidence ids, all offers, a profit estimate (assumptions
  listed), supplier search keywords/links, a draft Shopify CSV, and up to 50 cited sources. 404 if unknown.

Both are paid per request with the [x402](https://x402.org) protocol (v2, "exact" scheme, USDC via
EIP-3009). No account needed: the payment is the authorization.

1. Request without payment → **402** with a `PAYMENT-REQUIRED` header (base64 JSON: price, asset, network, `payTo`).
2. Agent signs a USDC `transferWithAuthorization` for that amount and retries with `PAYMENT-SIGNATURE`.
3. Server verifies the signature, recipient, amount, validity window and that the nonce was never used,
   runs the request, settles, and returns **200** with a `PAYMENT-RESPONSE` receipt header.
   Failed requests (e.g. 400 bad query, 404) are not charged — the authorization stays usable.
   Facilitator unreachable before the request runs → 503, not charged. Settlement outcome unknown → 502,
   no data, and that authorization is retired (the `AgentPayment` row stays `RESERVED` for reconciliation).

**Rule 2 isolation:** all payment code is in `src/server/payments/x402/` (`protocol.ts`, `verify.ts`,
`facilitator.ts`, `config.ts`, `middleware.ts`) and the `AgentPayment` ledger table. The data comes from
`src/server/opportunities/` (`service.ts`, `dossier.ts`), which knows nothing about payments; each route
just wraps one with the other.

**Modes** (`X402_MODE`):

- `mock` (local only) fully verifies real signed authorizations on Base Sepolia but moves no funds;
  settlement references start with `mock:`. Refused when `NODE_ENV=production`.
- `facilitator` verifies locally first, then verifies and settles on-chain through an x402 facilitator.
  Network is `X402_NETWORK` (default `eip155:84532` Base Sepolia). The facilitator (`X402_FACILITATOR_URL`)
  defaults to `https://x402.org/facilitator` on testnet (free, **testnet only**) and to Coinbase's
  `https://api.cdp.coinbase.com/platform/v2/x402` on Base mainnet (`eip155:8453`), which signs every request
  with `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` (first 1,000 settlements a month free, then $0.001 each).
  If Coinbase answers `settlement_pending`, the identical settle request is resent once; if it is still
  pending, the caller gets `settlement_unknown` with the `transaction` hash, which is also stored on the
  `RESERVED` row for reconciliation. When a facilitator refuses a payment, the payer's USDC balance is read
  from the chain (public Base RPC); if it is short, the 402 says `insufficient_funds` with a plain `message`
  (Coinbase otherwise reports an empty wallet as a generic `invalid_payload`).
- unset: agent endpoints answer 503.

Payments are received at `X402_PAY_TO` — your own wallet address. The facilitator pays the gas; payers
need USDC only.

**Mock agent:** `npm run agent:test -- http://localhost:3000` — gets the 402, signs with a throwaway
wallet, retrieves the data, then checks that replays, underpayment, expired or tampered payments and
garbage headers are refused and that a failed request isn't charged.

### MCP server (`mcp/`)

A stdio MCP server so Claude Desktop, Cursor, Claude Code and agent frameworks can use ProductRadar as
native tools: `find_product_opportunities`, `get_product_dossier` (both paid, settled automatically with the
official `@x402/fetch` client from the user's own wallet) and `get_payment_status` (free). Spending caps:
`PRODUCTRADAR_MAX_PRICE_USDC` (default 0.10 per call) and `PRODUCTRADAR_BUDGET_USDC` (default 1.00 per session).

It is a separate package with its own dependencies, bundled into one file and served from this site:
`npm run mcp:build` → `public/mcp/productradar-mcp-<version>.tgz` (commit it; older versions stay published
because installs point at their exact URL). Users install it with
`npx -y https://theproductradar.io/mcp/productradar-mcp-<version>.tgz` — see `/docs#mcp` and `mcp/README.md`.
Bump `mcp/package.json`'s version for every change; `/docs` links whatever version that file names.

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

A page can also be added to an existing product as an **extra source** (`ingestUrl(db, { url, productId })`):
another store selling the same item (its price becomes another offer, its rating more evidence), or an **expert
review** that publishes its verdict as structured data (score, reviewer, publication date — saved as REVIEW
evidence, quality 80; scores written only in article text are never read). Before adding, the two pages' names
must share distinctive words, which catches a wrong link but not a close variant — choose links carefully.
Placeholder ratings (e.g. "0 / 5 from 1,365 reviews") are rejected along with their count.

Code: `src/server/ingest/` (`fetch-page.ts`, `extract.ts`, `ingest.ts`) and `src/app/api/ingest/route.ts`.
Many large retailers (Amazon, REI, Brooks…) block automated readers and return an error; independent stores
(Shopify, WooCommerce) usually work.

### Bulk import

`npm run products:import -- scripts/data/real-products-2026-10.json` reads every page in the list with the
same code (robots.txt respected, one request a second) and prints each product's overall confidence. Entries
are `{ "category": "beauty", "url": "<store page>", "sources": ["<other store or expert review>", …] }`.
Re-running re-reads the pages as new captures. On production, run it inside the `web` service:

```bash
npx -y @railway/cli@latest ssh --service web "npx -y tsx scripts/import-products.ts scripts/data/real-products-2026-10.json"
```

Confidence reflects how much independent, recent evidence exists: one store page gives about 0.16; each extra
store or recent expert review adds to it. QUALITY (35%) and VALUE (25%) grow only with more independent
ratings, so they set the ceiling; nothing collects SENTIMENT (10%) yet.

### Search interest (Google Trends)

`npm run trends:enrich -- scripts/data/trend-keywords-2026-10.json` fetches 12 months of weekly Google search
interest per product through [SerpApi](https://serpapi.com/google-trends-api) and stores one SEARCH_INTEREST
evidence row per complete calendar month (the average of its weeks), then rescores the affected categories.
The list maps each product name to the keyword shoppers search for; every claim quotes that keyword and links
the same chart on Google Trends. Demo products are never enriched.

- Cost: one SerpApi search per product per run (free plan: 250 a month). The account check is free, and
  products that already hold last month's data are skipped, so a monthly run of 25 products uses 25.
- Start with `--dry-run`: it shows the searches left and what would be fetched, and uses none.
- Monthly points, not weekly: one lookup can't count as 52 pieces of evidence. Google scales each lookup to
  its own busiest week, so a month added by a later run can sit on a slightly different scale.
- Effect: SEARCH_INTEREST feeds TREND only (methodology v1.3.0). Google Trends scales every keyword to its
  own busiest week, so the index says which way interest is moving, not how big it is, and DEMAND would be
  misleading. A full TREND adds up to +0.10 OVERALL confidence; 11 monthly points add about +0.05 (e.g.
  0.17 → 0.22 for a one-store product). Keywords with too little search volume get no data, and use a search
  anyway.

On production (`SERPAPI_API_KEY` set on the `web` service), after a methodology change run
`npx -y tsx scripts/rescore.ts` once so every category, including the demo ones, uses the new rules:

```bash
npx -y @railway/cli@latest ssh --service web "npx -y tsx scripts/enrich-trends.ts scripts/data/trend-keywords-2026-10.json --dry-run"
```

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
  Age counts from the source's publication date when it has one (an expert review from 2024 is old even if we
  read it today), otherwise from when we captured it.
- QUALITY (star ratings), SENTIMENT, DEMAND (review counts), TREND (search-interest slope),
  VALUE (quality vs. price relative to the category median), OVERALL (weighted blend).
- Prices in different currencies are compared in euros at the European Central Bank's reference rates
  (`src/server/scoring/fx-rates.json`, dated; refresh with `npm run fx:update`). This affects only which
  offer is cheapest and VALUE; offers are always shown in their own price and currency. A currency the ECB
  doesn't publish is compared only with prices in that currency.
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
| `X402_MODE` | for agent API | `facilitator` (real settlement) or `mock` (local testing only). Empty = agent API returns 503. |
| `X402_NETWORK` | optional | `eip155:84532` Base Sepolia testnet (default) or `eip155:8453` Base mainnet |
| `X402_FACILITATOR_URL` | optional | Default `https://x402.org/facilitator` (free) on testnet, Coinbase CDP on mainnet |
| `X402_PAY_TO` | for agent API | Wallet address that receives agent payments |
| `X402_PRICE_USDC` | optional | Price per agent request, default `0.01` |
| `CDP_API_KEY_ID` | for mainnet | Coinbase Developer Platform secret API key ID (portal.cdp.coinbase.com) |
| `CDP_API_KEY_SECRET` | for mainnet | That key's secret (Ed25519 base64, or EC PEM) |
| `SERPAPI_API_KEY` | for `trends:enrich` | SerpApi key (serpapi.com, free plan 250 searches/month). Read by the script only, not the app. |

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
src/server/payments/x402/   x402 agent payments: protocol, verification, facilitator, 402 middleware
src/server/opportunities/   agent-facing opportunity data + dossier (no payment knowledge)
src/app/api/agent/v1/       paid agent endpoints
scripts/test-agent-client.ts  mock x402 agent
src/app/docs/               public API + MCP docs page (/docs)
mcp/                        MCP server package (own deps; bundled by npm run mcp:build)
src/app/signin/             sign-in pages
src/app/upgrade, billing/   upgrade, manage-billing and success routes
src/app/api/ingest/         ingestion endpoint
prisma/seed.ts              sample data
src/app/api/health/route.ts health check
scripts/db-start.mjs        local Postgres runner
scripts/verify-schema.ts    data-rule checks (npm run db:verify)
```

Payment code (Stripe in `src/server/billing/`, x402 in `src/server/payments/x402/`) must stay isolated from core logic.
