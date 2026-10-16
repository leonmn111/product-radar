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

- **Supplier matching:** the top 3 1688 / AliExpress matches with MOQ and delivery days. The AliExpress
  connector exists and waits for affiliate approval; 1688 needs a licensed provider.
- **Image matching:** proves a supplier listing shows the exact white-label item. *Scaffolded
  2026-10-16:* `src/engine/imageMatch.ts` has the typed interface and a SIMULATED score (random
  0.6–0.99), and confidence already counts image similarity alongside title similarity. The simulated
  score only runs on development sample data and is refused for anything else; a real comparison
  (perceptual hash, SSIM or a vision model) replaces it here.
- **Keepa API:** Amazon price, sales-rank and sales history, feeding momentum and velocity.

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
- **Meta Ads:** ad duration and density for Momentum and Saturation (Meta Ad Library API).
- **UI polish:** the Dossier page, exports (Shopify CSV, PDF, share link), and the live-search page.
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
  - the official AliExpress affiliate API (applied for, awaiting approval);
  - the v1 site stays up.

## Open items

- **Agency's allowances:** Agency is £149/month and gets everything Pro does, with a Standard Dossier
  at 1 credit like Pro. What it adds beyond Pro (seats, more free searches, cheaper Dossiers) isn't set yet.
- **Credit packs live:** they sell in Stripe test mode today. Run one test-mode purchase, then set
  `CREDIT_PACKS_ON_SALE=on` on Railway. People also need buttons on the site to buy credits and open
  Dossiers with them (the API exists: `POST /api/stripe/checkout`, `POST /api/dossier/{asin}`).

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
