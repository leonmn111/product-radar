// Adds Google search-interest evidence (Google Trends via SerpApi) to real products,
// then recalculates their scores. Each product costs one SerpApi search (free plan:
// 250 a month); products already holding last month's data are skipped for free.
//
// The list maps a product name to the keyword shoppers would search for it. The
// keyword is stated in every evidence claim, so readers can judge the match.
// Demo products are never enriched: their brands are fictional.
//
// Usage: npm run trends:enrich -- scripts/data/trend-keywords-2026-10.json [--dry-run] [--limit N] [--only "text"]
//   --dry-run   show what would be fetched and the searches left; uses no searches
//   --limit N   fetch at most N products this run
//   --only      only products whose name contains this text
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";
import { EvidenceInput } from "../src/lib/validation/evidence";
import { recalculateCategoryScores } from "../src/server/scoring/service";
import { latestCompleteMonth, trendContentHash, trendEvidence } from "../src/server/trends/evidence";
import { fetchInterestOverTime, SerpApiError, searchesLeft } from "../src/server/trends/serpapi";

const PAUSE_MS = 1_000;

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: { "dry-run": { type: "boolean", default: false }, limit: { type: "string" }, only: { type: "string" } },
});
const file = positionals[0];
if (!file) {
  console.error('Usage: npm run trends:enrich -- <keywords.json> [--dry-run] [--limit N] [--only "text"]');
  process.exit(1);
}
const limit = flags.limit === undefined ? Infinity : z.coerce.number().int().positive().parse(flags.limit);
const keywords = z.record(z.string().min(1), z.string().trim().min(2).max(100)).parse(JSON.parse(readFileSync(file, "utf8")));
const apiKey = process.env.SERPAPI_API_KEY?.trim();
if (!apiKey && !flags["dry-run"]) {
  console.error("SERPAPI_API_KEY is not set. Get a free key at https://serpapi.com/users/sign_up and add it to .env.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));

async function latestOverall(productIds: string[]) {
  const rows = await db.productScore.findMany({
    where: { productId: { in: productIds }, dimension: { in: ["OVERALL", "TREND"] } },
    orderBy: { calculatedAt: "desc" },
    distinct: ["productId", "dimension"],
    select: { productId: true, dimension: true, value: true, confidence: true },
  });
  const by = new Map<string, { overall?: number; trend?: number }>();
  for (const r of rows) {
    const cur = by.get(r.productId) ?? {};
    if (r.dimension === "OVERALL") cur.overall = r.confidence.toNumber();
    else cur.trend = r.value.toNumber();
    by.set(r.productId, cur);
  }
  return by;
}

(async () => {
  const products = await db.product.findMany({
    where: { isSample: false, name: { in: Object.keys(keywords) } },
    select: { id: true, name: true, category: true },
    orderBy: { name: "asc" },
  });
  const found = new Set(products.map((p) => p.name));
  const missing = Object.keys(keywords).filter((n) => !found.has(n));

  const lastMonth = latestCompleteMonth(new Date());
  const upToDate = new Set(
    (
      await db.evidence.findMany({
        where: {
          OR: products.map((p) => ({ productId: p.id, contentHash: trendContentHash(keywords[p.name], lastMonth) })),
        },
        select: { productId: true },
      })
    ).map((e) => e.productId),
  );
  const todo = products
    .filter((p) => !upToDate.has(p.id))
    .filter((p) => !flags.only || p.name.toLowerCase().includes(flags.only.toLowerCase()))
    .slice(0, limit);

  console.log(`${products.length} products matched, ${upToDate.size} already have ${lastMonth}, ${todo.length} to fetch.`);
  if (missing.length) console.log(`Not in this database (skipped): ${missing.join("; ")}`);

  if (apiKey) {
    const account = await searchesLeft(apiKey);
    console.log(`SerpApi ${account.plan ?? "plan"}: ${account.left} searches left; this run uses up to ${todo.length}.`);
    if (account.left < todo.length) {
      console.error("Not enough searches left. Use --limit to fetch fewer products.");
      process.exitCode = 1;
      return;
    }
  }
  if (flags["dry-run"]) {
    for (const p of todo) console.log(`  would fetch "${keywords[p.name]}" for ${p.name} [${p.category}]`);
    return;
  }
  if (todo.length === 0) return;

  const before = await latestOverall(todo.map((p) => p.id));
  const added = new Map<string, number>();
  const failures: string[] = [];

  for (const p of todo) {
    const keyword = keywords[p.name];
    try {
      const series = await fetchInterestOverTime(keyword, apiKey!);
      const rows = trendEvidence(p.id, series).map((r) => EvidenceInput.parse(r));
      const { count } = await db.evidence.createMany({ data: rows, skipDuplicates: true });
      added.set(p.id, count);
      console.log(`✓ ${p.name} — "${keyword}": ${series.weeks.length} weeks → ${count} new monthly points`);
    } catch (e) {
      if (e instanceof SerpApiError && (e.code === "auth" || e.code === "quota")) {
        console.error(`✗ Stopping: ${e.message}`);
        failures.push(`${p.name}: ${e.message}`);
        break;
      }
      const reason = e instanceof SerpApiError ? e.message : `unexpected: ${e instanceof Error ? e.message : String(e)}`;
      failures.push(`${p.name} ("${keyword}"): ${reason}`);
      console.log(`✗ ${p.name} — "${keyword}": ${reason}`);
    }
    await pause();
  }

  // VALUE compares prices across a category, so whole categories are rescored.
  const categories = [...new Set(todo.filter((p) => added.get(p.id)).map((p) => p.category))];
  for (const c of categories) await recalculateCategoryScores(db, c, new Date());

  const after = await latestOverall(todo.map((p) => p.id));
  console.log(`\nConfidence before → after (TREND score, 50 = flat):`);
  for (const p of todo.filter((x) => added.has(x.id))) {
    const b = before.get(p.id)?.overall;
    const a = after.get(p.id);
    console.log(
      `  ${(b ?? 0).toFixed(3)} → ${(a?.overall ?? 0).toFixed(3)}   trend ${a?.trend?.toFixed(1) ?? "—"}   ${p.name}`,
    );
  }
  if (failures.length) console.log(`\n${failures.length} product(s) got no trend data:\n  ${failures.join("\n  ")}`);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
