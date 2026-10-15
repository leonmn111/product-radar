# ProductRadar roadmap

**Pivot (2026-10-15):** from a static catalog to a **Live Search & Scrape on Demand** engine, paid
per query in USDC. The target design is in [ARCHITECTURE.md](ARCHITECTURE.md); the rules every
phase follows are in [CLAUDE.md](CLAUDE.md). Phases are vertical slices (Rule 1): each one ends
with something a paying caller can use.

## Why we're pivoting

Market feedback, in short:

1. **Coverage:** buyers want to search millions of products live (Amazon, TikTok Shop, AliExpress,
   Shopify), not browse ~30 imported ones.
2. **Sellability:** brand-restricted products (e.g. Skullcandy) are useless to resellers. Match
   unbranded / white-label supplier products (AliExpress, 1688) to retail listings.
3. **Margins:** no placeholder data. Use real supplier cost + shipping against the real selling
   price − fees − VAT − advertising.
4. **Demand:** sales velocity and saturation (sellers, TikTok and Meta ads), not just Google
   Trends.
5. **Confidence:** never show anything below 0.7. Gather more evidence or withhold. Keep the
   cited-evidence promise.
6. **Pricing:** lean entirely into USDC pay-per-query for live searches.

## Decisions (made 2026-10-15)

1. **Data sources and budget: a strict $50 a month to start.** Build against sandbox or recorded
   sample responses first, so the pipeline is built without spending.
   - **Retail: Rainforest API (Amazon).** Checked 2026-10-15: the only plan under $50 is Hobbyist,
     about $23/month billed yearly, for 500 requests/month (next: Starter, $83 for 10,000). There
     is a free trial but no sandbox. A US + UK query costs at least 2 requests, so the budget
     allows roughly 250 queries a month to begin with.
   - **Supplier: AliExpress.** DataForSEO turned out not to cover AliExpress (its shopping API covers
     Google Shopping and Amazon only). Options: the **official AliExpress Open Platform affiliate API**
     (free, needs an approved affiliate account; recommended under Rule 8), or a paid RapidAPI
     endpoint (third-party scraping, so its terms need checking). **Still to confirm**, but it
     doesn't block building the pipeline on sample responses.
2. **Markets: US and UK together** (USD and GBP, US and UK fee and VAT rules).
3. **Price: $0.50 USDC per query.** The per-query provider budget is kept far below that.
4. **Payments.** USDC via x402 stays the native way to pay. Fiat users get a **Stripe credit pack**
   ($10 for 20 queries). Current £39/month Pro subscribers are **grandfathered with 100 free
   queries a month**.
5. **The v1 site stays up** (no "coming soon" page). Its data is refreshed by hand with
   `scripts/refresh-data.ts`; it was run on 2026-10-15. The empty Railway `refresh` service was
   deleted.

## Phases

### Phase 8: live search skeleton (one query, end to end) ← in progress

Amazon US + UK via Rainforest (retail) and AliExpress (supplier), built first against recorded
sample responses, then switched to live calls inside the $50/month budget. A paid query ($0.50
USDC via x402, on testnet first) goes through planning, retail discovery, supplier match, evidence
with citations and the 0.7 gate. It returns either cited results or "withheld: insufficient
evidence". The margin covers only what those sources can prove; anything else is named as not
included.
**Done when** an agent pays, and gets a cited answer or an honest refusal, in under a set deadline
(for example 30 seconds).

### Phase 9: real margins

Landed cost (supplier price, shipping to the market, duty and import VAT) against net revenue
(selling price, cited fee rules, output VAT, advertising from a sourced figure or the caller's own
number). Census benchmarks are deleted.
**Done when** every margin line has a citation, or is clearly marked "not included".

### Phase 10: sellability

The brand-restriction filter (brand fields, title, trademark registers, channel rules), plus
white-label matching between retail listings and supplier products by image and title.
**Done when** branded products never appear, and each exclusion has a recorded reason.

### Phase 11: demand and saturation

Sales velocity from providers or from two dated observations; seller count; ad saturation from the
Meta Ad Library and TikTok sources; Google Trends kept for direction.
**Done when** each result shows velocity and saturation with citations, and both count toward the
0.7 gate.

### Phase 12: confidence loop

Below 0.7, the engine automatically looks for more independent evidence within the query's budget.
**Done when** the share of withheld results is measured and falls, without ever showing anything
below 0.7.

### Phase 13: credits for people

Stripe credit packs ($10 for 20 queries), a credit balance per account, and live search on the
site paid from credits. Grandfathered £39/month Pro subscribers get 100 free queries a month. All
of it inside the payments/billing side (Rule 2): the engine only ever sees a paid query.
**Done when** a card-paying user can buy a pack and run a live search, and a Pro subscriber's
monthly allowance resets on its own.

### Phase 14: coverage

More retail sources (Amazon, TikTok Shop, eBay, Shopify stores via shopping search), more
supplier sources (1688), and more markets.
**Done when** the agreed provider set is live behind the same adapter interface, each one with
recorded-response tests.

### Phase 15: launch v2

Per-query pricing tuned to measured provider cost. API v2 docs, the MCP server and the landing page
rewritten for live search. The v1 catalog and import scripts are retired, and new Pro sign-ups
close (existing subscribers keep their 100 queries a month).
**Done when** v2 is the only product on theproductradar.io.

## Done (v1, static catalog)

- **Phases 1–3: foundations.** Evidence-first data model, rule-based scoring, product import from
  store pages, Stripe Pro billing, the x402 agent API and MCP server, password sign-in.
- **Phase 4: account and billing.** Account page, in-app password, Stripe billing portal.
- **Phase 5: public landing page.** Pro-only catalog, full-page dossiers, free showcase products.
- **Phase 6: Shopify CSV export (Pro).** Follow-ups: RRP capture, and "lowest current price" now
  uses each store's newest price.
- **Phase 7: SEO and distribution.** Meta tags, share cards, favicon, sitemap and robots.txt,
  Plausible analytics, www → main domain redirect. Google Search Console verified; Plausible goals
  set.
- **Phase 8 (v1): scheduled data refresh. Halted 2026-10-15 by the pivot.** It is kept as a manual
  script, `scripts/refresh-data.ts` (`npm run data:refresh`), to keep v1's prices inside their
  30-day window until v2 replaces it. The scheduled Railway job was dropped.
