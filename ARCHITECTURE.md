# ProductRadar architecture: the 8-part Dossier engine

**Status: blueprint (2026-10-16).** It follows the *ProductRadar Strategy, x402 & Website Playbook*. That
document isn't in this repository; this file records the constraints taken from it. ProductRadar is a
**zero-tolerance financial screener for UK and EU sellers**: every number is cited, and nothing weakly
evidenced is shown. The order of work is in [ROADMAP.md](ROADMAP.md); the rules every change follows are
in [CLAUDE.md](CLAUDE.md). The site running today is still v1, a static catalog documented in
[README.md](README.md).

## The product: one Dossier per product

A Dossier answers "should I sell this, and what would I really keep?" in eight parts. The types are in
`src/types/dossier.ts` and `src/types/financials.ts`.

| # | Part | What it holds | Gate |
| --- | --- | --- | --- |
| 1 | **Verdict** | `LAUNCH`, `TEST` or `AVOID`, with the reasons behind it | Hidden below **0.5** confidence |
| 2 | **Resellability** | Flags: `brandDirect`, `trademarkRisk`, `requiresUKCA`, `cosmetics`, `batteries`, each with its reason and evidence | Each flag cites its evidence; unknown stays unknown |
| 3 | **LandedMargin** | Landed cost against net revenue, per channel and market (see the margin model) | Hidden below **0.7** |
| 4 | **Momentum** | 12-week trend slope, sales velocity, how long ads have been running | Hidden below **0.7** |
| 5 | **Saturation** | Seller count, store count, ad density | Hidden below **0.7** |
| 6 | **SupplierMatches** | The top 3 1688 / AliExpress matches, each with MOQ and delivery days | Each match cites its listing |
| 7 | **EvidenceList** | Every evidence item the Dossier uses: source, provider, time, quality, claim | Always shown (it *is* the audit trail) |
| 8 | **Exports** | Shopify CSV, PDF and a shareable link | Only built from shown (gated) parts |

### Confidence gates (CLAUDE.md Rule 5)

- **Two tiers.** The Verdict is shown from **0.5** confidence. Every number (margins, momentum,
  saturation, scores) needs **0.7**. Below its gate a part is *withheld*: the Dossier says so and lists
  the evidence it still needs. It never shows a greyed-out or estimated value.
- The types enforce it: a gated part is `Gated<T>`, either `{ status: "shown", value, confidence }` or
  `{ status: "withheld", confidence, missing }`. A value can't be built without its confidence.
- Confidence keeps v1's formula, `C = 1 − e^(−Σw/2)`. Each evidence item weighs quality × freshness
  (90-day half-life) × source type, and repeat captures of one source count once. Reaching 0.7 needs
  Σw ≈ 2.4, roughly four fresh, independent, structured sources; 0.5 needs Σw ≈ 1.4.
- Lives in `src/engine/confidence.ts`: `calculateConfidence()`, `VERDICT_THRESHOLD = 0.5` and `FINANCIAL_THRESHOLD = 0.7`. Supplier evidence is also weighted by how well it matches the product: title and image similarity combine as 1 − (1 − title)(1 − image), and an unscored supplier listing counts for nothing. Image similarity is simulated until Phase 1, so it is only ever applied to development sample data.

## Landed margin model (UK and EU)

Real numbers only (CLAUDE.md Rule 6): every line is sourced evidence, or a figure the caller supplied
and labelled as theirs. A line that can't be sourced is excluded and named; it is never guessed.

```
landed cost per unit  = supplier unit price (at the quoted MOQ)
                      + freight to the market, per unit
                      + EU (parcel ≤ €150): €3 customs duty per item type + €2 handling per item
                      + UK: import duty where it applies

net revenue per unit  = selling price
                      − VAT                 UK: 20% collected at the point of sale (marketplace collects
                                            for imports ≤ £135); EU: the destination country's rate
                      − platform fee stack  e.g. TikTok Shop UK 9% + £0.50 per order + 10–20% creator
                                            commission; Amazon FBA referral + fulfilment
                      − returns allowance   sourced return rate × the cost of a return
                      − CAC                 customer acquisition cost per sale (sourced, or the caller's own)

net margin per unit   = net revenue − landed cost        (also % of the price, and return on cost)
```

- Types: `FeeStack` (a union per channel: TikTok Shop UK, Amazon FBA, custom), the margin inputs and
  `LandedMargin` (with `netProfit`, `roiPercentage` = net profit ÷ landed cost, and `breakEvenAdCost` =
  net profit before ad cost) in `src/types/financials.ts`.
- Functions: `calculateUKMargin()` and `calculateEUMargin()` in `src/engine/margin.ts`. They are pure,
  validate their input with Zod, and round each line to the penny.
- Rules and defaults with their sources are in `src/engine/policy.ts` (checked 2026-10-16):
  - UK VAT 20% and the £135 point-of-sale rule (GOV.UK);
  - the EU €3 duty per item type in parcels under €150, from 1 July 2026;
  - EU standard VAT rates for 10 countries (TEDB);
  - TikTok Shop UK's 9% referral fee (charged before VAT).
- **Labelled estimates, not facts:** the £0.50 TikTok self-ship fee (no source confirms it yet), the 15%
  creator commission (deals run 10–20%) and the EU €2 handling fee (proposed, not adopted; included by
  default as the cautious choice, and can be switched off).

## Resellability (compliance)

`checkResellability(productData)` in `src/engine/compliance.ts` validates raw listing data with Zod and returns the five flags with their reasons and evidence. `isSellable(flags)` is false if any flag is tripped:

- `brandDirect`: the product is sold by the brand itself (brand-direct items aren't resellable white-label).
- `trademarkRisk`: a trademark record on file, a ™/® symbol, a named brand, or a known mark in the text (e.g. "for MagSafe").
- `requiresUKCA`: the category needs UKCA marking for Great Britain (electronics, toys, …).
- `cosmetics`: cosmetics rules apply (UK/EU cosmetics regulation, responsible person, notification).
- `batteries`: contains batteries (shipping and compliance restrictions).

An unknown flag stays `null` with the reason. It is never assumed safe.

## Momentum, saturation, suppliers

- **Momentum:**
  - Asked for only once the product is sellable and the evidence clears 0.7, so history isn't paid
    for on a Dossier that would be withheld or avoided.
  - Keepa's 90-day sales rank and lowest new price, one value a day. The last 12 weeks are fitted by
    least squares (`src/engine/trend.ts`, `momentum.ts`). The rank slope as a share of the average rank
    gives `trendDirection`: below −2% a week (rank falling) is ACCELERATING, above +2% is DECELERATING,
    otherwise FLAT.
  - It also gives the price trend (pence a week) and sales velocity (the lower bound of Amazon's "bought
    in past month" badge, never guessed from rank). Ad duration comes from the Meta Ad Library: simulated
    and sample-only until the connector is real.
  - The daily snapshot job will take over the history so Keepa isn't needed per Dossier.
- **Saturation:** sellers listing the same product, distinct stores, and ad density (active ads per
  seller or per keyword).
- **SupplierMatches:** the top 3 matches from 1688 and AliExpress by image and title similarity, each
  with unit price, MOQ, delivery days to the market and its listing as evidence.

## Daily snapshot job

`src/jobs/dailySnapshot.ts` runs once a day (scheduled on Railway when Phase 0 completes). It records the
day's trend, price, rank and ad observations for tracked products and keywords as dated evidence. That
history is what the 12-week slopes and velocity are calculated from. Every snapshot is new evidence with
its own time; nothing is overwritten. Rows go to the `TrendSnapshot` table (rank, price in pence,
sales velocity with how it was measured, provider, source, time and quality; one row per product,
day and provider).

`DossierCache` holds the latest built Dossier per product for 48 hours (from when its evidence was
read), so a repeat request reuses its evidence instead of paying the providers again.
`getProductDossier()` in `src/services/dossierService.ts` checks it first. Both Dossier routes use it:
`/api/agent/v2/dossier/{asin}` (USDC) and `/api/dossier/{asin}` (credits). The buyer pays the same
for a cached copy. It gets the buyer's own id, a note saying it came from the cache, and an
`X-Dossier-Cache: hit` header. Sample (development) Dossiers are only ever served to sample mode.

## Monetization

- **x402 (USDC, native).** Today's implementation supports the `exact` scheme. The playbook adds:
  - `Upto`: authorise a maximum and charge the actual cost, for on-demand work;
  - `SignInWithX`: a wallet-based identity, so repeat access needs no new account;
  - `PaymentIdentifier`: ties each payment to exactly one request.

  `SignInWithX` is built (2026-10-16, for the $2 Dossier; see below). `Upto` and `PaymentIdentifier`
  are built in Phase 2 against the current x402 specification.
- **Stripe fiat (humans):**
  - The only subscriptions are Pro (£29/month: 100 free searches a month, a Standard Dossier for 1 credit)
    and Agency (£149/month).
  - Credit packs: Starter £10 (20 credits), Growth £25 (55), Scale £50 (120). 1 credit = £0.50, so a Standard
    Dossier is 4 credits without a plan.
  - Typed in `src/server/billing/plans.ts` and sold through Stripe Checkout with inline prices, so nothing is
    set up in the Stripe dashboard. `/upgrade` sells Pro; `POST /api/stripe/checkout` sells any plan or pack
    (packs go live when `CREDIT_PACKS_ON_SALE=on`; Agency only once its 500 monthly credits are granted).
  - Paid packs are credited by the existing webhook (`/api/billing/webhook`, also at `/api/stripe/webhook`):
    the pack, amount and currency must match the catalogue.
  - The balance is `User.platformCredits`. Every change writes a `CreditLedgerEntry` in the same transaction:
    a purchase once per Stripe session, a spend never below zero (also a CHECK constraint), and a refund when a
    request fails.
  - `POST /api/dossier/{asin}` spends credits on a Standard Dossier.
  - Agency's 500 monthly credits come from `invoice.payment_succeeded`. The invoice must start or renew
    the period and be paid; its plan is the subscription's `plan` tag, else the £149 line.
    `CreditLedgerEntry.stripeInvoiceId` is unique, so each invoice grants once (a `GRANT` entry).
  - Emails (`src/lib/email.ts`, Resend; templates in `src/lib/emails/`): a receipt when a pack is first
    credited, and an alert when an Agency bulk job finishes. A failed send is logged and changes nothing
    else.
  - `POST /api/search` costs 1 credit, except Pro's 100 free searches in each billing cycle (counted in
    `SearchUsage`, `src/server/billing/allowances.ts`). The cycle runs from a month before the
    subscription's period end.
  - Agency bulk uploads (`POST /api/agency/bulk-upload`, up to 100 ASINs) spend 1 credit per ASIN in the
    same transaction that creates the job (`BulkJob`, `BulkJobItem`). Each item's ledger line references
    the Dossier id it's stored under, so its buyer can export it. A failed item is refunded.
- **Prices:**

| Product | Price |
| --- | --- |
| Search | $0.01 |
| Standard (Dossier) | $2 |
| On-Demand (fresh live data) | up to $4 (charged with `Upto`) |
| Shortlist | $12 |
| Pre-order | $38 |

- **Sign-In-With-X (free reopening).** `/api/agent/v2/dossier/{asin}` offers the x402 `sign-in-with-x`
  extension in its 402. A wallet that bought that exact path signs the EIP-4361 challenge
  (`SIGN-IN-WITH-X` header). The server checks it in `src/server/payments/x402/siwx.ts`: site, path,
  network, 5-minute age, signature, and a nonce that works once. If that wallet has a settled payment
  for the path, it gets the stored copy of its Dossier back at `x402-price: "0.00"`. Each payment row
  records the path it bought and the Dossier id (`reference`); the Dossier itself lives in
  `DossierRecord`, with no payment data. Smart-contract wallets (EIP-1271) aren't supported yet and pay
  as usual.
- **Bazaar manifest.** `GET /api/agent/v2/bazaar` is public and free, readable from any origin. It
  returns the paid endpoints in the x402 Bazaar discovery format (`x402Version`, `items`, `pagination`).
  Each item carries its live `accepts` (the same terms as its 402) and a `bazaar` extension: example
  input, a JSON Schema, and `routeTemplate` `/api/agent/v2/dossier/:asin`. It also has a description of
  the 8 parts, so an agent knows when to call it. Built in `src/server/payments/x402/discovery.ts`.
- **Discovery headers.** Every response from the v2 endpoints (402, 200 and errors alike) carries
  `x402-price`, `x402-payment-identifier` (a fresh 256-bit random id per request, which is also the
  Dossier's `id`) and `x402-bazaar` (the paid endpoints on offer, as JSON). They're built in
  `src/server/payments/x402/discovery.ts`. Replay protection is the signed payment's own nonce,
  which the middleware reserves once in the database, not this identifier.
- **The payment boundary stays where it is** (CLAUDE.md Rule 2). `src/server/payments/` quotes,
  verifies and settles; the engine never sees wallets, signatures or prices.

## Data sources

Paid sources need the owner's approval of cost first (Rule 8), and tests never call them.

| Role | Source | Status |
| --- | --- | --- |
| Amazon listings (UK) | Rainforest API | Connected; trial key set (2026-10-15) |
| Amazon price, rank and sales history | Keepa API (domain 2 = amazon.co.uk) | Connector scaffolded 2026-10-16 (`src/server/sources/keepa/`), tested on made-up data; needs a paid key (about €49/month, owner to approve) |
| Suppliers | AliExpress Open Platform, Drop Shipping API (official): `aliexpress.ds.text.search` | Connected 2026-10-23 (app 555220, owner's OAuth token renewed automatically; re-authorize by 2026-12-22) |
| Suppliers | 1688 via a licensed provider | Phase 1 |
| Ad duration and density | Meta Ad Library API | Phase 2; scaffold is SIMULATED and only feeds development sample data |
| TikTok Shop UK fees and listings | Published fee rules; listing data via a licensed provider | Fees in Phase 0 types; listings to be chosen |
| VAT, duty, handling | GOV.UK, EU customs rules | Phase 0 (cited in the margin engine) |
| Search trend | Google Trends via SerpApi | In use (v1) |

Never: scraping behind a login, bypassing a CAPTCHA or bot block, or ignoring robots.txt or a provider's
terms.

## Code layout

| Path | Job |
| --- | --- |
| `src/types/` | The data model: `dossier.ts` (the 8 parts, `Evidence`, `Gated<T>`), `financials.ts` (fee stacks, duties, VAT, landed margin) |
| `src/engine/` | Pure, tested business logic: `margin.ts`, `confidence.ts`, `compliance.ts`, `synonyms.ts` (query expansion), `imageMatch.ts` (scaffold: simulated), `trend.ts` (least-squares slope per week, daily step series). Next: the brand flagger |
| `src/services/` | Assembly: `dossierService.ts` fetches the listings and offers (the only I/O) and builds the 8-part Dossier from them (pure); `dossierStore.ts` keeps each delivered Dossier for reopening |
| `src/jobs/` | Scheduled work: `dailySnapshot.ts` |
| `src/server/sources/<provider>/` | One adapter per data provider (Rainforest and AliExpress today) |
| `src/server/payments/` | x402 and Stripe; the only code that knows about money changing hands |
| `src/server/live/` | The Phase 8 live-search pipeline built on 2026-10-15. Its confidence, margin and matching code moves into `src/engine/` as each engine module is implemented, then this folder goes |
| `src/components/DossierTerminal.tsx` | The Dossier's 8 panels as a dense terminal; enforces the Verdict gate in the UI too (preview: `/dev/terminal`, development only) |
| `src/components/DossierRunner.tsx`, `/terminal` | Run a Standard Dossier for an ASIN, paid in credits; without enough credits it opens the credit packs instead of calling anything |
| `src/engine/exports.ts` | `generateShopifyCSV()`: a Dossier with a shown margin as one draft Shopify listing; served at `/api/agent/v2/dossier/{asin}/export/csv` to its buyer |
| `src/services/library.ts`, `/library`, `src/components/DossierLibrary.tsx` | The user's purchased Dossiers: owned = a kept (unrefunded) credit spend that references a delivered Dossier (`DossierRecord`, with summary columns for listing). Reopening at `/terminal?asin=…&id=…` is free, from that copy |
| `src/components/CreditPacksModal.tsx` | The three credit packs, bought through Stripe Checkout; opened from the header's credit balance and from the terminal |
| `src/app/` | Pages and API routes (`/search`, `/api/agent/v2/search` at $0.01, `/api/agent/v2/dossier/{asin}` at $2) |

## Evidence, the product's core (CLAUDE.md Rule 3)

- Every number is an evidence item: source URL or provider record, provider, observed time, quality
  (0–100) and the claim in words.
- The Dossier's `EvidenceList` holds every item used, and each part points at the ids it rests on, so
  any figure can be traced to its source.
- Evidence is stored in Postgres as an append-only ledger: citations keep resolving, and a fresh enough
  result can be reused instead of paying a provider again.
