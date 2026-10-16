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
  same product however it's listed.
- **Brand flagger:** flags branded and brand-restricted products before anything else is done with them.
- **Daily snapshot cron:** records daily trend, price, rank and ad history (`src/jobs/dailySnapshot.ts`).
  *Template scaffolded 2026-10-16.*
- **Dossier assembly:** `src/services/dossierService.ts` turns Amazon UK listings and supplier offers
  into the 8-part Dossier: compliance first (an unsellable product gets no money maths), then
  confidence and the two gates. `/api/agent/v2/search` now returns it at **$0.01** with the
  `x402-price`, `x402-payment-identifier` and `x402-bazaar` headers. *Built 2026-10-16.*

### Phase 1: suppliers and history (weeks 2–4, to 13 Nov)

- **Supplier matching:** the top 3 1688 / AliExpress matches with MOQ and delivery days. The AliExpress
  connector exists and waits for affiliate approval; 1688 needs a licensed provider.
- **Keepa API:** Amazon price, sales-rank and sales history, feeding momentum and velocity.

### Phase 2: payments, ads and polish (weeks 4–8, to 11 Dec)

- **x402:** `Upto` (authorise a maximum, charge the actual cost), `SignInWithX` (wallet identity) and
  `PaymentIdentifier` (one payment per request). Today's x402 code supports `exact` only.
- **Stripe fiat credit packs:** £10, £25, £50.
- **Prices:** Search $0.01 · Standard $2 · On-Demand up to $4 · Shortlist $12 · Pre-order $38.
  `/api/agent/v2/search` moved from $0.50 to the $0.01 Search tier on 2026-10-16 (see Phase 0).
- **Meta Ads:** ad duration and density for Momentum and Saturation (Meta Ad Library API).
- **UI polish:** the Dossier page, exports (Shopify CSV, PDF, share link), and the live-search page.

## Decisions log

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
  - current £39/month Pro subscribers grandfathered with 100 free queries a month;
  - the v1 site stays up.

## Open items

- **The playbook itself** isn't in the repository. Sharing it lets these docs match it word for word
  (for example what Shortlist and Pre-order include).
- **EU marketplaces:** which countries and channels first (e.g. Amazon.de / .fr, TikTok Shop in which EU
  countries).
- **v1 data:** the live site's prices expire around **14 November**. Re-run `npm run data:refresh` on
  Railway before then, unless the daily snapshot job has taken over.
- **Rainforest trial:** 99 credits left; continuing needs the Hobbyist plan (about $23/month).
- **Search at $0.01 costs more than it earns:** each live search spends at least one Rainforest credit
  (about $0.046 on Hobbyist) plus an AliExpress call. Decide whether the live Dossier moves to the
  $2 Standard tier, or the $0.01 search serves cached results only.
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
