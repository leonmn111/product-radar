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
- Lives in `src/engine/confidence.ts`: `calculateConfidence()`, `VERDICT_THRESHOLD = 0.5` and `FINANCIAL_THRESHOLD = 0.7`. Supplier evidence is also weighted by how well it matches the product (an unscored supplier listing counts for nothing).

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

- **Momentum:** the 12-week slope of search or sales trend, sales velocity (units per period from a
  provider, or the change between two dated observations), and ad duration (how long the longest-running
  ads have run). History comes from the **daily snapshot job**.
- **Saturation:** sellers listing the same product, distinct stores, and ad density (active ads per
  seller or per keyword).
- **SupplierMatches:** the top 3 matches from 1688 and AliExpress by image and title similarity, each
  with unit price, MOQ, delivery days to the market and its listing as evidence.

## Daily snapshot job

`src/jobs/dailySnapshot.ts` runs once a day (scheduled on Railway when Phase 0 completes). It records the
day's trend, price, rank and ad observations for tracked products and keywords as dated evidence. That
history is what the 12-week slopes and velocity are calculated from. Every snapshot is new evidence with
its own time; nothing is overwritten.

## Monetization

- **x402 (USDC, native).** Today's implementation supports the `exact` scheme. The playbook adds:
  - `Upto`: authorise a maximum and charge the actual cost, for on-demand work;
  - `SignInWithX`: a wallet-based identity, so repeat access needs no new account;
  - `PaymentIdentifier`: ties each payment to exactly one request.

  These are built in Phase 2 against the current x402 specification.
- **Stripe fiat credit packs:** £10, £25 and £50.
- **Prices:**

| Product | Price |
| --- | --- |
| Search | $0.01 |
| Standard (Dossier) | $2 |
| On-Demand (fresh live data) | up to $4 (charged with `Upto`) |
| Shortlist | $12 |
| Pre-order | $38 |

- **Discovery headers.** Every response from `/api/agent/v2/search` (402, 200 and errors alike) carries
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
| Amazon price, rank and sales history | Keepa API | Phase 1 |
| Suppliers | AliExpress Open Platform affiliate API (official) | Connector built, waiting for affiliate approval |
| Suppliers | 1688 via a licensed provider | Phase 1 |
| Ad duration and density | Meta Ad Library API | Phase 2 |
| TikTok Shop UK fees and listings | Published fee rules; listing data via a licensed provider | Fees in Phase 0 types; listings to be chosen |
| VAT, duty, handling | GOV.UK, EU customs rules | Phase 0 (cited in the margin engine) |
| Search trend | Google Trends via SerpApi | In use (v1) |

Never: scraping behind a login, bypassing a CAPTCHA or bot block, or ignoring robots.txt or a provider's
terms.

## Code layout

| Path | Job |
| --- | --- |
| `src/types/` | The data model: `dossier.ts` (the 8 parts, `Evidence`, `Gated<T>`), `financials.ts` (fee stacks, duties, VAT, landed margin) |
| `src/engine/` | Pure, tested business logic: `margin.ts`, `confidence.ts`, `compliance.ts`. Next: synonym search and the brand flagger |
| `src/services/` | Assembly: `dossierService.ts` fetches the listings and offers (the only I/O) and builds the 8-part Dossier from them (pure) |
| `src/jobs/` | Scheduled work: `dailySnapshot.ts` |
| `src/server/sources/<provider>/` | One adapter per data provider (Rainforest and AliExpress today) |
| `src/server/payments/` | x402 and Stripe; the only code that knows about money changing hands |
| `src/server/live/` | The Phase 8 live-search pipeline built on 2026-10-15. Its confidence, margin and matching code moves into `src/engine/` as each engine module is implemented, then this folder goes |
| `src/app/` | Pages and API routes (`/search`, `/api/agent/v2/search`) |

## Evidence, the product's core (CLAUDE.md Rule 3)

- Every number is an evidence item: source URL or provider record, provider, observed time, quality
  (0–100) and the claim in words.
- The Dossier's `EvidenceList` holds every item used, and each part points at the ids it rests on, so
  any figure can be traced to its source.
- Evidence is stored in Postgres as an append-only ledger: citations keep resolving, and a fresh enough
  result can be reused instead of paying a provider again.
