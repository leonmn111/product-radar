# ProductRadar

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
| `npm run db:migrate` | Dev: create a new migration from `prisma/schema.prisma` changes and apply it. |
| `npm run db:deploy` | Production: apply pending migrations only (never creates new ones). |
| `npm run db:status` | Show which migrations are applied. |
| `npm run db:studio` | Browse the database in a web UI. |
| `npm run typecheck` / `npm run lint` | Static checks. |
| `npm run build` | Production build. |

## Health endpoint

`GET /api/health`

- **200** `{"status":"ok", ...}` — database reachable, migrations applied cleanly.
- **503** `{"status":"degraded"}` — database reachable but migrations not run or one failed.
- **503** `{"status":"error"}` — database unreachable. (Error detail is shown only outside production.)

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
src/app/api/health/route.ts health check
scripts/db-start.mjs        local Postgres runner
```

Payments (x402) are intentionally not implemented yet and must stay isolated from core logic.
