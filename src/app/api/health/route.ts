import { connection } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

type MigrationRow = { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null };

// GET /api/health — liveness + database + migration status.
// 200 = healthy, 503 = database unreachable or a migration failed.
export async function GET() {
  await connection(); // always run at request time, never prerender/cache

  const startedAt = performance.now();
  const timestamp = new Date().toISOString();

  try {
    await db.$queryRaw`SELECT 1`;
    const latencyMs = Math.round(performance.now() - startedAt);

    const migrations = await readMigrationStatus();
    const healthy = migrations.state === "ok";

    return Response.json(
      {
        status: healthy ? "ok" : "degraded",
        timestamp,
        checks: {
          database: { status: "ok", latencyMs },
          migrations,
        },
      },
      { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        status: "error",
        timestamp,
        checks: {
          database: {
            status: "error",
            // Raw error text can leak hostnames/credentials — only show it locally.
            ...(env.NODE_ENV !== "production" && { detail: errorMessage(error) }),
          },
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function readMigrationStatus() {
  const [{ exists }] = await db.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists`;
  if (!exists) return { state: "not_initialised" as const, applied: 0, latest: null };

  const rows = await db.$queryRaw<MigrationRow[]>`
    SELECT migration_name, finished_at, rolled_back_at
    FROM _prisma_migrations ORDER BY started_at`;

  const failed = rows.filter((r) => r.finished_at === null && r.rolled_back_at === null);
  const applied = rows.filter((r) => r.finished_at !== null && r.rolled_back_at === null);

  return {
    state: failed.length > 0 ? ("failed" as const) : ("ok" as const),
    applied: applied.length,
    latest: applied.at(-1)?.migration_name ?? null,
    ...(failed.length > 0 && { failed: failed.map((r) => r.migration_name) }),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
