# ProductRadar architecture: Live Search & Scrape on Demand

**Status: target architecture.** Pivot decided 2026-10-15, after market feedback. The site running
today is still v1: a static, hand-imported catalog of a few dozen products, described in
[README.md](README.md). Nothing below is built yet. The order of work is in [ROADMAP.md](ROADMAP.md),
and the rules every change must follow are in [CLAUDE.md](CLAUDE.md).

## What changes, and why

| Feedback | v1 (today) | v2 (target) |
| --- | --- | --- |
| **Coverage:** search millions of SKUs | ~30 products imported by hand into Postgres | Every query searches live sources (marketplaces, shopping search, supplier platforms) through third-party APIs |
| **Sellability:** no brand-restricted items | Branded products (e.g. Skullcandy) listed like any other | Brand-restricted items are filtered out; the engine looks for unbranded / white-label products a seller can actually source |
| **Margins:** real numbers, no placeholders | Wholesale cost estimated from US Census retail margins | Real supplier cost + shipping (+ duty) against the real selling price − fees − VAT − advertising. A cost we can't source is left out and the result says so |
| **Demand:** velocity and saturation | Review counts and Google Trends | Sales velocity, number of competing sellers, ad saturation (TikTok / Meta), plus search trend |
| **Confidence:** hide below 0.7 | Every score shown with its confidence, however low | Nothing below 0.7 is shown. The engine gathers more evidence within the query's budget, or withholds the result and says what's missing. Every number keeps its citation |
| **Pricing:** pay per query in USDC | Stripe £39/month subscription; x402 pay-per-request for agents on the existing catalog | Every live search is paid per query in USDC via x402 |

## One paid query, end to end

1. **Quote.** A caller (an AI agent, or the site on a user's behalf) asks
   `GET /api/agent/v2/search?q=…&market=GB`. The server answers `402 Payment Required` with the
   price in USDC (x402). The quote is set before any paid work starts.
2. **Pay.** The caller signs a USDC payment and repeats the request. The payments module verifies
   and settles it, and passes the core engine nothing but "paid, query id X".
3. **Plan.** The query becomes search terms, a target market (currency, VAT, fee rules) and a
   provider budget (maximum calls and maximum provider cost for this query).
4. **Retail discovery.** Retail sources are searched in parallel within the budget. They return
   listings with price, seller, rating, review count and velocity signals, each with its source.
5. **Sellability filter.** Brand-restricted and branded items are dropped (see below). What's
   left is grouped into "same product" clusters across listings.
6. **Supplier match.** Supplier platforms (AliExpress, 1688) are searched for each cluster. Matches
   are scored by image and title similarity. Each kept match gives a unit price, minimum order
   and a shipping quote to the target market.
7. **Demand and saturation.** Sales velocity, number of sellers, active ads and search trend are
   collected for each cluster.
8. **Margin.** Landed cost is compared with net revenue per sales channel (formula below).
9. **Evidence and confidence.** Every number from steps 4–8 is an evidence item. Confidence is
   calculated per result. Below 0.7, the engine spends what's left of the budget on more
   independent evidence. Still below 0.7, the result is withheld and the response says which
   evidence is missing.
10. **Respond and record.** The response returns the results with their citations. The evidence
    is written to Postgres, so every citation keeps resolving and identical lookups are reused
    while still fresh.

## Components

| Module | Job | v1 code it builds on |
| --- | --- | --- |
| `src/server/live/` | Query planner, budget, orchestration, response assembly | new |
| `src/server/sources/<provider>/` | One adapter per data provider, behind a common interface: `search(query, market, budget)` → listings with provenance | `server/ingest` (structured-data extraction), `fetch-page.ts` (SSRF guard, robots.txt) |
| `src/server/sellability/` | Brand-restriction filter | new |
| `src/server/matching/` | Same-product clustering; retail ↔ supplier matching (image + title) | new |
| `src/server/demand/` | Velocity, saturation, trend signals | `server/trends` (Google Trends via SerpApi) |
| `src/server/margins/` | Landed cost and channel economics. **Census benchmarks removed** | fee schedules in `margins/benchmarks.ts` (eBay, Shopify card rates) |
| `src/server/evidence/` | Evidence items, quality scoring, citations, persistence | Evidence model, `lib/validation/evidence.ts` |
| `src/server/scoring/` | Scores and confidence; the 0.7 display gate | `scoring/engine.ts` (weights, half-life, confidence) |
| `src/server/payments/x402/` | Quote, verify, settle. Knows nothing about products | existing module, unchanged boundary |
| Postgres | Evidence ledger and short-lived cache, **not a catalog** | Prisma schema (Evidence, Offer); catalog tables retired |
| `mcp/` and `/api/agent/v2` | How agents call the engine | existing MCP server and agent API v1 |

## Data sources (candidates; nothing chosen yet)

Every provider is an **owner decision**: coverage, terms of use and cost must be checked and the
spend approved before any adapter is built (CLAUDE.md Rule 8). Prices change, so check them on the
day.

| Role | Candidates to evaluate | Notes |
| --- | --- | --- |
| **Amazon US + UK (chosen for Phase 8)** | **Rainforest API** | Hobbyist plan ≈ $23/month (billed yearly) for 500 requests; free trial, no sandbox |
| Retail prices across stores | Google Shopping via SerpApi (key already in use); eBay Browse API | Broad price comparison; SerpApi is billed per search |
| Amazon price and rank history | Keepa | Price and sales-rank history (paid); a velocity source for Phase 11 |
| TikTok Shop products and sales | TikTok Shop / Creative Center data via licensed third-party providers | No general public API: needs a provider that has the rights to this data |
| Shopify stores | Stores' own public product data and structured data on product pages (already supported in v1) | Store discovery comes from shopping search |
| **AliExpress (chosen for Phase 8; source to confirm)** | AliExpress Open Platform affiliate API (official, free, needs approval); RapidAPI AliExpress endpoints (paid, third-party) | DataForSEO doesn't cover AliExpress. Unit price, minimum order and shipping to the target market |
| More suppliers | 1688 via a licensed provider | Phase 14 |
| Ad saturation | Meta Ad Library API; TikTok Creative Center | How many advertisers run ads for the product, and since when |
| Search trend | Google Trends via SerpApi (in use) | Direction only: each keyword is scaled to its own peak |
| Trademarks / brands | UK IPO, EUIPO, USPTO search | For the sellability filter |
| Fees, VAT, duty | Published marketplace fee pages; GOV.UK VAT and tariff data | Each rule cited, as v1 already does for eBay and Shopify |

**Never:** scraping behind a login, bypassing a CAPTCHA or a bot block, or ignoring robots.txt or a
provider's terms. If a source can't be read within its terms, it isn't used.

## Evidence and confidence

- **Every number is evidence.** Each item has a source URL or provider record id, the provider, the
  time it was observed, a quality score and the extracted value (CLAUDE.md Rule 3). Responses
  carry the citations, which is the product's main differentiator.
- **Quality by how the fact was obtained.** An official API or licensed provider scores high;
  structured data on a store page next; plain page text lowest (v1's fixed quality table,
  extended per provider).
- **Confidence** keeps v1's formula: C = 1 − e^(−Σw/2), where each item's weight w combines its
  quality, its age (90-day half-life) and its source type. Repeat captures of one source count once.
  Reaching **0.7 needs Σw ≈ 2.4**, which is roughly four fresh, independent, structured sources.
- **The 0.7 gate.** Scores, margins and opportunities below 0.7 are never shown, not even greyed out.
  The engine first tries to close the gap within the query's budget (another retailer, another
  supplier quote, a second velocity source). Then it either shows the result at ≥ 0.7, or returns
  "withheld: insufficient evidence" with a list of what's missing.

## Margin model (real numbers only)

```
landed cost per unit = supplier unit price
                     + shipping to the target market (per unit, at the quoted quantity)
                     + import duty and import VAT, where they apply

net revenue per unit = real selling price (live listings in the target market)
                     − marketplace / payment fees      (published fee rules, cited)
                     − output VAT                      (if the caller is VAT-registered; GOV.UK rate, cited)
                     − advertising cost per sale       (only from a sourced figure or the caller's own number)

margin per unit      = net revenue − landed cost        (also as % of selling price and return on cost)
```

No benchmark or placeholder numbers: the US Census wholesale ranges go. If a component can't be
sourced (most often the advertising cost), it is **excluded and named in the result**: "margin
before advertising". The engine never guesses it. Caller-supplied figures (their own ad cost per
sale, VAT status) are labelled as such.

## Sellability

- **Branded or brand-restricted listings are dropped.** Signals: the listing's brand field, the brand
  in the title, a registered trademark for the brand in the target market, and known
  restricted-brand rules for the channel.
- **White-label is the target.** A retail cluster qualifies when one or more supplier listings
  match it on image and title similarity, without the brand.
- Every exclusion is recorded with its reason, so a result can say why a popular product isn't
  shown.

## Demand and saturation

- **Velocity:** units per day or month from a provider (with its stated method), or the change in
  "sold" counters or sales rank between two dated observations.
- **Saturation:** how many sellers list the same product, how many advertisers run ads for it and
  how long those ads have been running.
- **Trend:** search interest direction (Google Trends) and social trend signals where a licensed
  source exists.
- All are evidence with citations, and they count toward the 0.7 gate like everything else.

## Payments and pricing

- **$0.50 USDC per query via x402** is the business model and the native way to pay. Each query's
  provider budget is kept far below that, and the total provider spend is capped at $50 a month to
  start. Queries that find nothing are free or nearly free.
- **Fiat credit packs.** Stripe sells credit packs ($10 for 20 queries). Grandfathered £39/month Pro
  subscribers get 100 free queries a month. Credits and allowances live in the payments/billing
  side; a query paid from credits reaches the engine exactly like one paid in USDC.
- **The payment boundary stays where it is** (CLAUDE.md Rule 2). `payments/x402` quotes, verifies
  and settles; `live/` never sees wallets, signatures or prices.

## Cost, speed and abuse control

- A budget per query: maximum provider calls, maximum spend, and an overall deadline. Results
  that are still incomplete when it runs out are withheld, not guessed.
- Providers are called in parallel, each with its own timeout and rate limit.
- Cache by normalised query and product key, with a lifetime per fact type. Prices are fresh for
  hours, supplier listings for days, trademarks for weeks. Cached evidence keeps its original
  observed time.
- No paid provider calls in automated tests: adapters are tested against recorded responses.

## From v1 to v2

| Kept | Retired once v2 replaces it |
| --- | --- |
| Evidence model and quality scoring | The static catalog, `/dashboard` browsing and catalog gating |
| Structured-data extraction and `fetchPage` safety (SSRF, robots.txt) | Import scripts and scheduled refresh (Phase 8 halted 2026-10-15) |
| Confidence maths (now gated at 0.7) | US Census wholesale benchmarks |
| x402 payments module and MCP server | Landing-page showcase built from the catalog |
| eBay and Shopify fee rules, Google Trends adapter | New £39/month Pro sign-ups (existing subscribers keep 100 queries a month) |
| Next.js app, auth, Postgres (as ledger and cache) | |
