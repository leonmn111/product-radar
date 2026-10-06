// Runs a real PostgreSQL server locally for development — no Homebrew,
// Docker, or admin rights needed. Data persists in ./.postgres-data.
// Usage: npm run db:start   (leave it running; Ctrl+C to stop)
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const url = new URL(process.env.DATABASE_URL ?? "");
const host = url.hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  console.error(`DATABASE_URL points at "${host}", not localhost. db:start is for local dev only.`);
  process.exit(1);
}

const databaseDir = path.resolve(".postgres-data");
const dbName = url.pathname.replace(/^\//, "");

const pg = new EmbeddedPostgres({
  databaseDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
});

if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
  console.log("First run: initialising local Postgres data folder…");
  await pg.initialise();
}

await pg.start();

const client = pg.getPgClient();
await client.connect();
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
await client.end();
if (rowCount === 0) {
  await pg.createDatabase(dbName);
  console.log(`Created database "${dbName}".`);
}

console.log(`Postgres running on port ${url.port || 5432} (database "${dbName}"). Ctrl+C to stop.`);

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
