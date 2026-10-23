# ProductRadar roadmap: 8-week fast track

Following the *ProductRadar Strategy, x402 & Website Playbook* (2026-10-16): a zero-tolerance financial
screener for **UK and EU sellers**, delivered as an 8-part Dossier per product. The design is in
[ARCHITECTURE.md](ARCHITECTURE.md); the rules every phase follows are in [CLAUDE.md](CLAUDE.md). Work is
test-driven and modular. Types and scaffolding come first, then each engine module is built against its
tests.

## Timeline

Week 1 starts on 2026-10-16. Phases overlap by design.

### Phase 0: foundation (weeks 1–2, to 30 Oct)

- **Types:** the 8-part `Dossier`, `Evidence`, `Gated<T>`, fee stacks, duties, VAT and `LandedMargin`
  (`src/types/`). *Scaffolded 2026-10-16.*
- **Margin engine:** `calculateUKMargin()` and `calculateEUMargin()`. EU €3 duty + €2 handling per item;
  UK VAT at the point of sale; platform fee stacks (TikTok Shop UK 9% + £0.50 + 15% creator
  commission; Amazon FBA); returns allowance; CAC. Every rate cited or labelled an estimate.
  *Built 2026-10-16.*
- **Confidence:** `calculateConfidence()`, with the two gates: Verdict at 0.5, numbers at 0.7.
  *Built 2026-10-16.*
- **Compliance:** `checkResellability()` and `isSellable()`: brand-direct, trademark risk, UKCA,
  cosmetics, batteries. *Built 2026-10-16.*
- **Synonym search:** one query expands to the names sellers actually use, so a search covers the
  same product however it's listed. `expandQuery()` in `src/engine/synonyms.ts` (25 niche groups,
  UK wording). The extra terms are searched only when the first search finds fewer than 4 listings
  of the product, within the query's call budget: each is another paid Rainforest search.
  *Built 2026-10-16.*
- **Brand flagger:** flags branded and brand-restricted products before anything else is done with them.
- **Daily snapshot cron:** records daily trend, price, rank and ad history (`src/jobs/dailySnapshot.ts`).
  *Template scaffolded 2026-10-16.*
- **Dossier assembly:** `src/services/dossierService.ts` turns Amazon UK listings and supplier offers
  into the 8-part Dossier: compliance first (an unsellable product gets no money maths), then
  confidence and the two gates. `/api/agent/v2/search` now returns it at **$0.01** with the
  `x402-price`, `x402-payment-identifier` and `x402-bazaar` headers. *Built 2026-10-16.*
- **Standard Dossier, $2:** `/api/agent/v2/dossier/{asin}` builds the Dossier for one Amazon UK product
  from its product page (price, brand, seller, category), other listings of it and supplier matches,
  and keeps the delivered copy. A wallet that bought it reopens it free with Sign-In-With-X
  (`x402-price: "0.00"`), with no new provider calls. *Built 2026-10-16* (pulled forward from Phase 2).

### Phase 1: suppliers and history (weeks 2–4, to 13 Nov)

- **Supplier matching:** the top 3 1688 / AliExpress matches with MOQ and delivery days. AliExpress is
  connected through its Drop Shipping API (2026-10-23); its shipping quote (`aliexpress.ds.freight.query`,
  verified live) is the next step for the shipping line of the margin. 1688 needs a licensed provider.
- **Image matching:** proves a supplier listing shows the exact white-label item. *Scaffolded
  2026-10-16:* `src/engine/imageMatch.ts` has the typed interface and a SIMULATED score (random
  0.6–0.99), and confidence already counts image similarity alongside title similarity. The simulated
  score only runs on development sample data and is refused for anything else; a real comparison
  (perceptual hash, SSIM or a vision model) replaces it here.
- **Keepa API:** Amazon price, sales-rank and sales history, feeding momentum and velocity.
  *Scaffolded 2026-10-16:* `fetchKeepaHistory(asin, 2)` in `src/server/sources/keepa/` reads 90 days of
  SALES rank and NEW price (Keepa's domain 2 is amazon.co.uk; 3 is amazon.de), and
  `calculateTrendSlope()` in `src/engine/trend.ts` gives the least-squares slope per week (a negative
  rank slope means rising sales). Tested on a made-up response in Keepa's documented format; no key yet.

### Phase 2: payments, ads and polish (weeks 4–8, to 11 Dec)

- **x402:** `Upto` (authorise a maximum, charge the actual cost) and `PaymentIdentifier` (one payment
  per request). Payments are `exact` only today. `SignInWithX` was built early, on 2026-10-16, for the $2 Dossier.
- **Stripe fiat credit packs:** Starter £10 = 20 credits, Growth £25 = 55, Scale £50 = 120 (1 credit =
  £0.50), Pro £29/month (100 free searches a month; a Standard Dossier costs 1 credit instead of 4) and
  Agency £149/month. *Checkout and webhook
  built 2026-10-16* (`POST /api/stripe/checkout`, `/api/stripe/webhook`; catalogue in
  `src/server/billing/plans.ts`). Sold in Stripe test mode until the owner switches it on;
  credits are a PostgreSQL ledger (`User.platformCredits` + `CreditLedgerEntry`, 2026-10-16), spent by
  `POST /api/dossier/{asin}` (4 credits, 1 on Pro).
- **Prices:** Search $0.01 · Standard $2 · On-Demand up to $4 · Shortlist $12 · Pre-order $38.
  `/api/agent/v2/search` moved from $0.50 to the $0.01 Search tier on 2026-10-16 (see Phase 0).
- **Momentum, wired 2026-10-16:**
  - The Standard Dossier asks Keepa for 90 days of history only once the product is sellable and the
    evidence clears 0.7, so tokens aren't spent on Dossiers that would be withheld or avoided anyway.
  - It fits the last 12 weeks (`src/engine/momentum.ts`): `trendDirection` ACCELERATING / FLAT /
    DECELERATING from the rank slope as a share of the average rank (±2% a week is flat). It also
    gives the price trend and sales velocity (the lower bound of Amazon's "bought in past month" badge).
  - With no Keepa key, Momentum is withheld and says so.
- **Meta Ads:** ad duration and density for Momentum and Saturation (Meta Ad Library API). *Scaffolded
  2026-10-16:* `fetchLongestRunningAd()` in `src/server/sources/metaAds/` is SIMULATED (a random 0–120
  days). It only feeds development sample Dossiers, labelled; real Dossiers say "no ad data". The real
  API is free but needs an identity-confirmed Meta account and covers ads shown in the EU and UK.
- **UI polish:** the Dossier page, exports (Shopify CSV, PDF, share link), and the live-search page.
  *Shopify CSV built 2026-10-16:*
  - `generateShopifyCSV()` in `src/engine/exports.ts`, served by
    `GET /api/agent/v2/dossier/{asin}/export/csv` to whoever bought the Dossier: credits (session) or
    USDC (Sign-In-With-X).
  - Only from a shown margin; it imports as a draft.
  - Vendor is "ProductRadar Import"; no Amazon photos or invented copy (owner, 2026-10-16).
- **Agency bulk processor, built 2026-10-16:**
  - `POST /api/agency/bulk-upload` takes a CSV of up to 100 ASINs from an account whose plan in the
    database is Agency (otherwise 403 with the upsell).
  - 1 credit per ASIN, taken in the same transaction that creates the `BulkJob` and its PENDING items:
    with too few credits nothing is written.
  - Items are scored in the background (`after()`); a failed item is refunded. Progress at
    `GET /api/agency/bulk-upload/{jobId}`.
- **Landing page for launch, 2026-10-16:**
  - New headline: "Institutional-grade product research for Amazon & AliExpress", plus the value
    proposition.
  - A platform section shows the 8-part Dossier, the Momentum engine and the Agency bulk processor, each
    with a LIVE / LAUNCHING SOON badge read from the live configuration (`src/components/landing/platform.tsx`),
    so nothing is claimed before it's on. Meta ad signals are marked in development.
  - Every "Create a free account" goes through `/get-started`: to the Dossier terminal once live Dossiers
    are on, to the dashboard until then.
- **Agency monthly credits, built 2026-10-19:**
  - `invoice.payment_succeeded` for an Agency subscription (first month and each renewal) adds 500 credits
    as a `GRANT` ledger entry, unique per invoice, and emails `SubscriptionRenewal`.
  - Plan changes, manual invoices, unpaid invoices and Pro invoices grant nothing.
- **Transactional email, built 2026-10-16:**
  - `src/lib/email.ts` sends through the Resend SDK: `RESEND_API_KEY`, else the existing `AUTH_RESEND_KEY`.
    A `re_mock…` key prints instead of sending, in development only.
  - A paid credit pack sends `CreditPurchaseReceipt` once, from the webhook. A finished Agency bulk job
    sends `BulkJobCompleteAlert`.
  - A failed email is logged and never undoes the credits.
- **Dossier library, built 2026-10-16:**
  - `/library` shows the signed-in user's plan, credits, Pro free searches left and a Top up button.
  - Below that, a table of every Dossier they've paid for and kept. `GET /api/user/history` returns it,
    starting from the user's own credit ledger so no one else's purchases can appear.
  - "Open Dossier" goes to `/terminal?asin=…&id=…`, which reopens that copy free.
  - The Pro catalog stays at `/dashboard`.
- **Human search, built 2026-10-16:**
  - `POST /api/search` searches Amazon UK for signed-in people: 1 credit, or free for Pro's first 100
    searches in each billing cycle (counted in `SearchUsage`). With neither: 402.
  - The credit is taken first and returned if the search fails or finds nothing.
  - It returns products (each its best listing, with its evidence) to open as Dossiers.
  - Only Rainforest is needed, so it works in production before AliExpress is connected.
- **x402 Bazaar manifest, built 2026-10-16:** `GET /api/agent/v2/bazaar` lists the $0.01 search and the
  $2 Dossier, in the x402 discovery format, with live terms and an LLM-readable description of the 8
  parts. It passes the official `@x402/extensions` bazaar validator.
  *Started 2026-10-16:* `src/components/DossierTerminal.tsx`, the 8 panels in a dense, terminal-style
  layout. A withheld Verdict shows "VERDICT WITHHELD: Insufficient Market Evidence" and blurs the
  margin. Preview at `/dev/terminal` (development only).

## Decisions log

- **2026-10-16 (later), from the owner:**
  - **Plans:** Pro £29/month and Agency £149/month are the only subscriptions; the £39 Pro is gone (no
    paying customers, so nobody is grandfathered).
  - **Credits:** 1 credit = £0.50. A Standard Dossier costs 4 credits without a plan, 1 on Pro.
- **2026-10-16, supersedes parts of 2026-10-15:**
  - **Markets:** UK and EU sellers (was US + UK).
  - **Pricing:** the five tiers above (was $0.50 per query).
  - **Credit packs:** £10 / £25 / £50 (was $10 for 20 queries).
  - **Confidence:** two tiers, Verdict 0.5 and numbers 0.7 (was 0.7 for everything; the owner chose two
    tiers).
  - **New sources:** Keepa (Phase 1) and the Meta Ad Library (Phase 2).
- **Still standing from 2026-10-15:**
  - a $50/month provider budget to start;
  - Rainforest for Amazon listings (connected);
  - the official AliExpress Open Platform: app 555220 is a Drop Shipping app (the affiliate API
    refuses it), connected on 2026-10-23;
  - the v1 site stays up.

## Open items

- **Legal details before the compliance reviews:** the Terms (`/terms`) and Privacy Policy (`/privacy`)
  show marked placeholders until `src/lib/legal.ts` has the operator's legal name, a contact email that's
  read, and a postal address (plus the ICO registration number, if registered). Have both pages reviewed
  before submitting to Stripe or AliExpress.

- **AliExpress: authorize the app again before 22 December 2026.** The Drop Shipping API acts for the
  owner's AliExpress account through an access token (30 days), which the app renews by itself with the
  refresh token. Renewing doesn't extend the refresh token, which ends 60 days after authorization
  (2026-10-23 → 2026-12-22). Before then, open the authorization link (`client_id=555220`,
  `redirect_uri=https://theproductradar.io`), exchange the code within minutes, and set the four
  `ALIEXPRESS_*TOKEN*` variables in Railway. Without it, supplier searches fail from that date.

- **Stripe dashboard: listen to `invoice.payment_succeeded`.** Agency's 500 monthly credits are granted
  on that event (since 2026-10-19), so the webhook endpoint in Stripe must include it. Agency then goes on
  sale with credit packs, when `CREDIT_PACKS_ON_SALE=on`.
- **Bulk jobs run inside the web server:** fine on one Railway instance (a restart is picked up
  again when the job's status is next read). A queue (e.g. a Railway worker) is the step up if
  uploads get large or the site runs on more than one instance.
- **Credit packs live:** they sell in Stripe test mode today. Run one test-mode purchase, then set
  `CREDIT_PACKS_ON_SALE=on` on Railway. The buy buttons are built (header balance, the Buy credits
  window, the Dossier terminal at `/terminal`); until then they show "go on sale soon".
- **Keepa costs money (owner's approval needed):** third-party guides put the cheapest Keepa API plan
  at about €49/month (20 tokens a minute; 1 token per product), with no free tier. Confirm on keepa.com.
  The connector is scaffolded and tested on made-up data; it needs `KEEPA_API_KEY` to run.
- **The playbook itself** isn't in the repository. Sharing it lets these docs match it word for word
  (for example what Shortlist and Pre-order include).
- **EU marketplaces:** which countries and channels first (e.g. Amazon.de / .fr, TikTok Shop in which EU
  countries).
- **v1 data:** the live site's prices expire around **14 November**. Re-run `npm run data:refresh` on
  Railway before then, unless the daily snapshot job has taken over.
- **Rainforest trial:** 98 credits left (one spent on 2026-10-16 recording a product page for tests);
  continuing needs the Hobbyist plan (about $23/month). A $2 Dossier uses 2–4 credits (product page,
  a search, up to two synonym searches), about $0.09–$0.18 on Hobbyist.
- **Search at $0.01 costs more than it earns:** each live search spends at least one Rainforest credit
  (about $0.046 on Hobbyist), two when a synonym is searched, plus an AliExpress call. The $2 Dossier
  endpoint now exists; decide whether the $0.01 search stays live or serves cached results only.
- **Unconfirmed fee figures** (labelled as estimates in every margin until confirmed): the TikTok
  Shop UK £0.50 self-ship fee, and the EU €2 handling fee (proposed, not adopted). Confirm the
  TikTok fees in Seller Center; the EU fee when it's adopted.

## Done

- **v1 (static catalog), phases 1–7:** evidence-first data model, rule-based scoring, store-page import,
  Stripe Pro billing, the x402 agent API and MCP server, password sign-in, account and billing portal,
  public landing page, Shopify CSV export, RRP capture, SEO and analytics, the www redirect. Google
  Search Console is verified and Plausible goals are set.
- **Live-search groundwork (2026-10-15):** the pipeline in `src/server/live/` (retail discovery,
  same-product grouping, supplier match, evidence-only margin, confidence gate), the Rainforest and
  AliExpress connectors, sample mode, the `/search` page, and the paid `/api/agent/v2/search` endpoint.
  It folds into the Phase 0–2 engine as each module is built.
