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
| `npm test` | Unit tests for the scoring engine. |
| `npm run typecheck` / `npm run lint` | Static checks. |
| `npm run build` | Production build. |

## Health endpoint

`GET /api/health`

- **200** `{"status":"ok", ...}` — database reachable, migrations applied cleanly.
- **503** `{"status":"degraded"}` — database reachable but migrations not run or one failed.
- **503** `{"status":"error"}` — database unreachable. (Error detail is shown only outside production.)

## Products endpoint

`GET /api/products?category=wireless-earbuds&limit=20`

Products ranked by latest OVERALL score. Each includes `bestOffer`, `scores` (latest per dimension, with
`confidence`, `methodologyVersion` and the `evidenceIds` used), `offers`, and `evidence` (source, timestamp,
quality score, metric). `category` must be a lowercase slug; `limit` is 1–50 (default 20). Invalid input → 400.
No authentication yet — treat as internal.

## Scoring engine

`src/server/scoring/engine.ts` — pure math, no AI, no randomness: identical evidence and date always give identical
scores. Full formulas are in the file header. In short:

- Each piece of evidence is weighted by its quality score, its age (halves every 90 days) and its source type.
- QUALITY (star ratings), SENTIMENT, DEMAND (review counts + search interest), TREND (search-interest slope),
  VALUE (quality vs. price relative to the category median), OVERALL (weighted blend).
- Thin evidence is pulled toward a neutral 50 and gets low confidence. No usable evidence → no score at all.
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
prisma/seed.ts              sample data
src/app/api/health/route.ts health check
scripts/db-start.mjs        local Postgres runner
scripts/verify-schema.ts    data-rule checks (npm run db:verify)
```

Payments (x402) are intentionally not implemented yet and must stay isolated from core logic.
