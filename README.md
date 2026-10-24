# ProductRadar

> **Pivot in progress (2026-10-15).** ProductRadar is being rebuilt as a **Live Search & Scrape on
> Demand** engine, paid per query in USDC. This README documents **v1**, the static catalog that
> still runs on theproductradar.io today. For the target design see [ARCHITECTURE.md](./ARCHITECTURE.md),
> for the plan and open decisions [ROADMAP.md](./ROADMAP.md). v1 sections such as the import scripts
> describe code that v2 will retire.

Next.js (App Router) · TypeScript · PostgreSQL · Prisma 7 · Zod · Tailwind CSS.
Architecture rules live in [CLAUDE.md](./CLAUDE.md).

## First-time setup

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # already done locally; edit if your DB differs
npm run db:start            # terminal 1: local Postgres (leave running)
npm run db:migrate          # terminal 2: apply migrations
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
| `npm run db:rescore` | Recalculate scores for every category (e.g. after a formula change). History is kept. |
| `npm run products:import -- <list.json>` | Import real products from a list of store pages, each with optional extra sources (other stores, expert reviews). See "Bulk import" below. |
| `npm run fx:update` | Refresh the ECB euro reference rates in `src/server/scoring/fx-rates.json` (used only to compare prices across currencies). Commit, deploy, then rescore. |
| `npm run trends:enrich -- <keywords.json> [--dry-run] [--limit N] [--only text]` | Add Google search-interest evidence (Google Trends via SerpApi) to real products and rescore them. See "Search interest" below. |
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

## Landing page, dashboard and dossiers

`/` is the public landing page (`src/app/page.tsx`): hero, live counts (stores tracked, live products, current
price gaps, evidence items), a showcase of up to two live products with a real price gap between stores
(`src/server/products/showcase.ts` picks them; nothing is padded), how it works, the agent API, pricing and FAQ.
The counts and showcase come from `getShowcase()` (`showcase-cache.ts`), cached as one snapshot per hour and only
read at request time, never during the build. "Get started" goes to sign-up, then straight to Stripe Checkout
(`/signin?tab=register&callbackUrl=/upgrade`). It's the only indexed page besides `/docs` (see `robots.ts`,
`sitemap.ts`, `opengraph-image.tsx`). Signed-in visitors never see it: `src/proxy.ts` sends anyone with a session
cookie to `/dashboard`.

`/dashboard` — the catalog, **Pro only**. Signed out → sign-in; Free → the Pro offer plus the showcase dossiers.
Ranked product cards (`product-card.tsx`): square photo from `Product.imageUrl` (plain `<img>`, lazy, no referrer;
a brand-monogram tile when there's no photo or it fails to load), brand, title, overall score with its confidence
badge, best current price, the Value score, the margin summary, and "N sources" plus "Trends" when Google
search-interest data exists. Each card is one link (a stretched title link) to the product's dossier, and lifts
on hover. On wide screens a Cards / Table switch keeps the full score table. Filter by category and sort by any
score or price. Data comes from `/api/products` in the browser. Components live in `src/components/dashboard/`.

`/dossier/[slug]` — one product's full dossier: verdict, margin & arbitrage on both resale routes, profit
calculator, supplier search and Shopify export (Pro), score breakdown and every piece of evidence. Pro can open
any product; everyone else can open sample products and the products featured on the landing page
(`canViewDossier` in `src/server/auth/entitlements.ts`). A Free account opening another live product gets the Pro
offer; a signed-out visitor is sent to sign in.

Everything except `/` and `/docs` is `noindex`.

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

| | Signed out / Free | Pro (£29/month) or Agency (£149/month) |
| --- | --- | --- |
| Landing page showcase and its dossiers | ✓ | ✓ |
| Catalog (`/dashboard`, `/api/products`) | — (sign-in / Pro offer; API 401 / 403) | ✓ |
| Any product's dossier (`/dossier/[slug]`) | samples and showcased products only | ✓ |
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
    10 registrations per client per hour; 3 reset emails per address and 10 per client per 15 minutes.
  - **Forgot password** (`/signin/forgot` → email → `/signin/reset?token=…`): a one-time link, valid for
    1 hour, sent through Resend (`src/lib/email.ts`; printed to the terminal in development without
    `AUTH_RESEND_KEY`). Only a SHA-256 hash of the link's token is stored (`PasswordResetToken`). The reply
    is the same whether or not the address has an account. Using a link sets the password, marks the address
    verified, voids the account's other links, lifts any wrong-password lockout and signs in. It also works
    for email-link-only accounts (it's how they set a first password). Links use `APP_URL` when set, so set
    it in production. Code: `src/server/auth/password-reset.ts`.
  - **Account page** (`/account`, signed in only): profile, plan and billing, and a password card. An
    email-link account can set a first password there (no current password needed); an account with one must
    enter it to change it, and wrong attempts count toward the sign-in limit. Saving there signs nobody out,
    unless the user ticks "Also sign out my other devices": then every session ends and this device signs
    straight back in. Code: `setAccountPassword` in `src/server/auth/password.ts`, `src/app/account/`.
  - **Ending sessions:** sessions are cookies, so `User.passwordChangedAt` does the job of revoking them. Any
    session that signed in before it reads as signed out. A reset, a dropped unproven password, and the
    account page's "sign out other devices" set it; an ordinary set or change on the account page doesn't.
- **Plan checks** live in `src/server/auth/entitlements.ts` and only read `User.subscriptionTier`.
- **Billing** (Stripe) is isolated in `src/server/billing/` and is the only code that writes the
  `stripe*` / `subscription*` fields on `User`.
  - `/upgrade` → sign in if needed → Stripe Checkout (or the billing portal if already Pro)
  - `/account` → plan status (renewal, cancellation, failed payment) with "Manage Subscription & Billing",
    shown once the user has a Stripe customer; Free users see the upgrade instead. Header "Billing" links here.
  - `POST /api/billing/portal` → `{ "url" }` for a Stripe customer portal session that returns to `/account`.
    Signed-in, same-site requests only; 10 per minute per account; 409 `no_billing_account` if the user has
    never checked out (it never creates a Stripe customer); 503 if billing isn't configured.
  - `/billing/manage` → redirects to the same portal (the account page's no-JavaScript fallback)
  - `/billing/success` → confirms the checkout with Stripe and unlocks Pro immediately
  - `POST /api/billing/webhook` → signature-verified; applies `customer.subscription.*` events,
    ignores out-of-order (older) events. `active`, `trialing`, `past_due` ⇒ the subscription's plan (Pro or
    Agency); anything else ⇒ Free. A paid credit pack (`checkout.session.completed`, mode `payment`) is added
    to `User.platformCredits` with a `CreditLedgerEntry`, once per Checkout Session. A paid Agency invoice
    (`invoice.payment_succeeded`: first month and each renewal) adds 500 credits, once per invoice, and emails
    the renewal. Also served at `POST /api/stripe/webhook`.
  - `POST /api/stripe/checkout` `{ "tier": "starter" | "growth" | "scale" | "pro" | "agency" }` → a Checkout URL for
    a credit pack (£10 / £25 / £50 for 20 / 55 / 120 credits; 1 credit = £0.50) or a plan. Sold only with a
    Stripe test key outside production until `CREDIT_PACKS_ON_SALE=on` (Agency: test mode only until its 500 monthly credits are granted).
  - `POST /api/search` `{ "q": "…" }` → Amazon UK products for signed-in people: 1 credit, or one of Pro's
    100 free searches a billing cycle; nothing found or a failure costs nothing.
  - `POST /api/dossier/{asin}` → a Standard Dossier paid in credits: 4 (£2.00), or 1 on Pro / Agency.
  - `POST /api/agency/bulk-upload` (Agency only) → a CSV of up to 100 ASINs, 1 credit each, scored in the
    background; `GET /api/agency/bulk-upload/{jobId}` shows progress. Too few credits: nothing is charged.
  - `GET /api/agent/v2/bazaar` → the x402 Bazaar manifest of the paid agent endpoints (public).
  - `GET /api/user/history` → the signed-in user's Dossiers (the `/library` page); reopening one at
    `/terminal?asin=…&id=…` is free.
    Credits are taken first and returned if the Dossier can't be built. Served from the 48-hour cache when fresh.

### Turning on Stripe (test mode first)

1. Create a Stripe account → Developers → API keys → copy the **test** secret key into `.env` as `STRIPE_SECRET_KEY`.
2. Prices need no setup: checkout sets them inline from `src/server/billing/plans.ts` (Pro £29/month,
   Agency £149/month, the three credit packs).
3. Webhook: in production add an endpoint `https://<your-site>/api/billing/webhook` in Stripe → Developers →
   Webhooks, listening to `customer.subscription.created`, `.updated`, `.deleted`,
   `checkout.session.completed` and `invoice.payment_succeeded` (Agency's 500 monthly credits); copy its
   signing secret into `STRIPE_WEBHOOK_SECRET`.
   Locally you can skip this — the success page confirms the payment directly — or use the Stripe CLI
   (`stripe listen --forward-to localhost:3000/api/billing/webhook`).
4. Stripe → Settings → Billing → Customer portal: click **Save** once so "Manage Subscription & Billing" works.
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
native tools, on the v2 agent API since 0.2.0: `search_products` (`/api/agent/v2/search`, $0.05) and
`get_product_dossier` (`/api/agent/v2/dossier/{asin}`, $2.00), both paid and settled automatically with the
official `@x402/fetch` client from the user's own wallet, and `get_payment_status` (free). Spending caps:
`PRODUCTRADAR_MAX_PRICE_USDC` (default 2.00 per call) and `PRODUCTRADAR_BUDGET_USDC` (default 5.00 per session).
Discovery: `/llms.txt` describes the site and API for language models, and `glama.json` (repo root, also
served at `/glama.json`) names the maintainer for the Glama MCP directory.

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

Products ranked by latest OVERALL score. Each includes `bestOffer`, `margin` (see "Margin engine"), `scores`
(latest per dimension, with `confidence`, `methodologyVersion` and the `evidenceIds` used), `offers`, and
`evidence` (source, timestamp, quality score, metric). `category` must be a lowercase slug; `limit` is 1–50 (default 20). Invalid input → 400.
This is the Pro catalog: signed-out → 401 `unauthorized`, Free → 403 `pro_required`. Pro and Agency get live and sample products.

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

## Margin engine

`src/server/margins/engine.ts` (pure, like the scoring engine; formulas in the file header) adds `margin` to every
product with a current price: the retail price and two resale price gaps, from captured store prices only. It is
computed when a product is read, so nothing needs rescoring. Methodology 2.0.0 removed v1's US Census wholesale
range: a category average is not a supplier cost (CLAUDE.md Rule 6).

- **UK landed margin (the dossier page):** `src/services/catalogMargin.ts` runs the v2 engine on the catalog's
  own prices. The resale checks come first (`src/engine/compliance.ts`; a product that fails one gets no money
  figures anywhere in the dossier, and `product.resellable` is false). Then: retail = median of the stores'
  current GBP prices; supplier = median of the live AliExpress offers whose titles match (one budgeted call,
  cached for a day per search term; a failed search is never cached); the 0.7 confidence gate; and
  `calculateUKMargin` (20% UK VAT, the £135 low-value rule, TikTok Shop UK fees). Shipping, returns and ad cost
  are named as not counted. Amazon UK fees need the product's category and size tier, so no Amazon figure is shown.
- **Which prices count (scoring v1.5.0, margin v1.2.0):** each store's newest capture from the last 30 days,
  and only if that capture is in stock or on pre-order. An older, cheaper capture never stands in for a store's
  current price, so "lowest current price", the Value score and the margin figures all use the same prices.
- **Arbitrage ratings:** only from those current offers, in the same currency.
  Buy at the cheapest store and resell at the median of the others, then rate the trade twice:
  `arbitrage` after eBay UK's business seller fee (12.9% + the 0.35% regulatory fee + £0.40 per order, £0.30 up to
  £10; margin v2.1.0), and `arbitrageOwnStore` after Shopify
  Payments card fees for your own shop (Basic plan: 2% + 25p in GBP, otherwise the US 2.9% + 30¢; advertising and
  the plan fee are not included). `HIGH_ARBITRAGE` needs a return of 25% or more and at least €10 per unit,
  `MODERATE` 10% and €3, and anything else (including a single store) is `RETAIL_ONLY`.
- The dossier's calculator starts at the sourced supplier cost and keeps the waterfall's VAT and fee lines; the
  Shopify export's cost per item is the calculator's figure, never an estimate. The v1 agent dossier's
  `profitEstimate` is always null since 2.0.0.
- To refresh: re-read the eBay and Shopify fee pages, update `benchmarks.ts`, and bump `MARGIN_METHODOLOGY_VERSION`.

## Data model

| Model | Purpose |
| --- | --- |
| `User` | Account with a `subscriptionTier` (FREE / PRO / AGENCY) and its `platformCredits` balance. |
| `CreditLedgerEntry` | Every change to a credit balance: purchase (unique per Stripe session), spend, refund, with the balance after. |
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
| `X402_PRICE_USDC` | optional | Price per request on the legacy v1 agent API (`/api/agent/v1`), default `0.01`. The v2 prices ($0.05 search, $2 Dossier) are set in `src/server/payments/x402/discovery.ts` |
| `CDP_API_KEY_ID` | for mainnet | Coinbase Developer Platform secret API key ID (portal.cdp.coinbase.com) |
| `CDP_API_KEY_SECRET` | for mainnet | That key's secret (Ed25519 base64, or EC PEM) |
| `SERPAPI_API_KEY` | for `trends:enrich` | SerpApi key (serpapi.com, free plan 250 searches/month). Read by the script only, not the app. |
| `RESEND_API_KEY` | optional | Resend key for credit receipts, bulk-job alerts, sign-in links and password resets; falls back to `AUTH_RESEND_KEY`. A `re_mock…` key prints emails to the terminal instead (development only; refused in production) |
| `RAINFOREST_API_KEY` | for live search (v2) | Amazon US + UK via the Rainforest API (rainforestapi.com) |
| `KEEPA_API_KEY` | optional (v2) | Keepa API (paid): Amazon UK sales-rank and price history for a Dossier's Momentum. Without it, Momentum is withheld |
| `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_ACCESS_TOKEN` | for live search (v2) | AliExpress Open Platform, Drop Shipping API. The access token comes from the owner authorizing the app. Until all three are set, `/api/agent/v2/search` answers 503 before asking for payment |
| `ALIEXPRESS_REFRESH_TOKEN`, `ALIEXPRESS_TOKEN_EXPIRES_AT`, `ALIEXPRESS_REFRESH_EXPIRES_AT` | with the access token | Let the app renew the access token three days before it expires (ISO times). Renewed pairs are kept encrypted in the `ProviderToken` table, so restarts don't lose them |
| `FREE_VERDICTS_PER_DAY`, `FREE_VERDICTS_PER_VISITOR` | optional | The landing page's free check (`POST /api/free-verdict`, no account): live checks per UTC day site-wide (default 20, counted in `FreeVerdictDay`; cached products don't count; 0 = off) and per visitor IP per 24 hours (default 1, in memory). Each live check spends 2–4 Rainforest credits |
| `WELCOME_DOSSIERS_PER_DAY` | optional | New accounts per UTC day, site-wide, that get their free first Dossier (4 WELCOME credits, once per account: `WelcomeGrant`, counted in `WelcomeGrantDay`). Default 50; 0 = off. Sign-ups are also limited to 3 new accounts per client address per day (password or email link) |
| `LIVE_SAMPLE_DATA` | development | `on` = the `/search` page runs on a recorded Amazon UK search and sample AliExpress offers (try "magnetic power bank"). Refused in production; locally the paid `/api/agent/v2/search` uses it too, and every Dossier it returns says `sample: true` |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | optional | Turns on Plausible analytics (cookieless), e.g. `theproductradar.io`. Read at build time: redeploy after setting. |
| `NEXT_PUBLIC_PLAUSIBLE_SRC` | optional | A self-hosted Plausible script URL instead of plausible.io's |
| `NEXT_PUBLIC_POSTHOG_KEY` | optional | Turns on PostHog instead (`phc_…`), cookie-free in-memory mode. Ignored when Plausible is set. |
| `NEXT_PUBLIC_POSTHOG_HOST` | optional | Default `https://eu.i.posthog.com` |

**Search and sharing.** `robots.txt` and `sitemap.xml` list only the public pages (`/` and `/docs`); every other
page is `noindex`. The share card (`src/components/brand/share-card.tsx`) is used for Open Graph and X on every page,
and the icon is `src/app/icon.svg` (`/favicon.ico` redirects to it). Analytics conversions are page views:
`/signin` (sign-up started), `/dashboard` (signed in) and `/billing/success` (paid upgrade).

## Layout

```
prisma/schema.prisma        database models (add per vertical slice)
prisma/migrations/          versioned SQL migrations (commit these)
src/lib/env.ts              validated environment
src/lib/db.ts               shared Prisma client
src/lib/validation/         Zod input validators
src/server/scoring/         scoring engine (pure) + service (DB) + tests
src/server/products/        product read model for the API, landing showcase
src/app/api/products/       products endpoint (Pro catalog)
src/app/page.tsx            public landing page (/)
src/app/dashboard/          catalog (/dashboard, Pro only)
src/app/dossier/[slug]/     full-page product dossier
src/proxy.ts                sends signed-in visitors from / to /dashboard
src/components/dashboard/   dashboard UI (URL bar, table, cards, evidence panel)
src/components/landing/     landing page showcase and live counts
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
src/app/account/            account page: profile, plan & billing, password
src/app/api/ingest/         ingestion endpoint
scripts/delete-sample-products.mjs  removes the old demo products (fictional "(sample)" brands, example.com sources)
src/app/api/health/route.ts health check
scripts/db-start.mjs        local Postgres runner
scripts/verify-schema.ts    data-rule checks (npm run db:verify)
```

Payment code (Stripe in `src/server/billing/`, x402 in `src/server/payments/x402/`) must stay isolated from core logic.
