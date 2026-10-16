<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ProductRadar: the pivot to live search (read before building)

The product is moving from a static Postgres catalog (v1, what runs today) to a **Live Search &
Scrape on Demand** engine (v2). Read these before any change:

- [CLAUDE.md](CLAUDE.md): the rules (vertical slices, x402 isolation, evidence first, estimates,
  the two confidence gates (Verdict 0.5, numbers 0.7), real numbers only, sellable products only,
  data access within the rules).
- [ARCHITECTURE.md](ARCHITECTURE.md): the 8-part Dossier, the two confidence gates, the UK/EU
  landed-margin model, monetization, data sources and the code layout.
- [ROADMAP.md](ROADMAP.md): which phase is next, and the owner decisions that block it.

### Working rules for v2

- **Don't grow v1.** No new catalog features: dashboard browsing, import scripts, scheduled
  refresh, Census benchmarks, catalog showcase. Touch v1 only to keep the live site working.
- **Types first, then tests, then logic.** The data model lives in `src/types/`; business logic in
  `src/engine/` (pure functions, each built against its tests); scheduled work in `src/jobs/`.
- **One adapter per provider** in `src/server/sources/<provider>/`, all behind the same interface.
  The rest of the engine never imports a provider's SDK or response shapes.
- **Provenance travels with every value.** Adapters return evidence items (source, provider,
  observed time, quality, value), never bare numbers. Downstream code must not create a number
  without its evidence.
- **The gates live in one place.** `src/engine/confidence.ts` holds both thresholds (Verdict 0.5,
  numbers 0.7), and a gated part is a `Gated<T>`, so nothing below its gate reaches an API response,
  the MCP server, an export or the UI.
- **Payments stay at the edge.** `payments/x402` quotes, verifies and settles; the engine receives
  only a paid query id. No prices, wallets or signatures inside `live/` or `sources/`.
- **Budget every query.** Provider calls go through the query's budget (calls, spend, deadline)
  and the cache. When the budget runs out, results are withheld, not estimated.
- **No paid calls in tests.** Adapters are tested against recorded provider responses. A new paid
  provider, or a new spend, needs the owner's approval first.
- **Never invent evidence.** No sample, demo or fallback numbers in v2 responses. If the evidence
  isn't there, say so.
