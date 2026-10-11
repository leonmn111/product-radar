// Imports real products from a list of public pages, using the same ingest code
// as the dashboard's "analyze a product link" box — nothing is typed in by hand.
// Each entry's `url` (the product's own store page) becomes a product; its
// optional `sources` (other stores selling it, expert reviews) are added to that
// product as extra evidence. Safe to re-run: pages are re-read and saved as new
// captures, and scores are recalculated.
//
// Usage: npm run products:import -- scripts/data/real-products-2026-10.json
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";
import { FetchPageError } from "../src/server/ingest/fetch-page";
import { IngestError, ingestUrl, type IngestResult } from "../src/server/ingest/ingest";

const Entry = z.object({
  category: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  url: z.url(),
  sources: z.array(z.url()).default([]),
});
const PAUSE_MS = 1_000; // be gentle with the sites we read

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run products:import -- <list.json>");
  process.exit(1);
}
const entries = z.array(Entry).parse(JSON.parse(readFileSync(file, "utf8")));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));

const reason = (e: unknown) =>
  e instanceof FetchPageError || e instanceof IngestError ? e.message : e instanceof Error ? `unexpected: ${e.message}` : String(e);

function describe(r: IngestResult) {
  const x = r.extracted;
  const facts = [
    x.price && `${x.price.amount} ${x.price.currency}`,
    x.rating && `rated ${x.rating.value}/${x.rating.best}`,
    x.reviewCount !== null && `${x.reviewCount} ratings`,
    x.expertReview && `expert ${x.expertReview.value}/${x.expertReview.best}`,
  ].filter(Boolean);
  return facts.join(", ") || "listing only";
}

(async () => {
  const failures: string[] = [];
  const productIds = new Set<string>();

  for (const entry of entries) {
    let main: IngestResult;
    try {
      main = await ingestUrl(db, { url: entry.url, category: entry.category });
      productIds.add(main.product.id);
      console.log(`✓ ${main.status.padEnd(7)} ${main.product.name} [${entry.category}] — ${describe(main)}`);
    } catch (e) {
      failures.push(`${entry.url}: ${reason(e)}`);
      console.log(`✗ ${entry.url} — ${reason(e)}`);
      await pause();
      continue;
    }
    for (const url of entry.sources) {
      await pause();
      try {
        const r = await ingestUrl(db, { url, productId: main.product.id });
        console.log(`    + ${r.source.kind === "expert_review" ? "review" : "store "} ${new URL(url).hostname} — ${describe(r)}`);
      } catch (e) {
        failures.push(`${url}: ${reason(e)}`);
        console.log(`    ✗ ${url} — ${reason(e)}`);
      }
    }
    await pause();
  }

  // Latest overall score per imported product (scores are estimates, with a confidence).
  const rows = await db.productScore.findMany({
    where: { productId: { in: [...productIds] }, dimension: "OVERALL" },
    orderBy: { calculatedAt: "desc" },
    distinct: ["productId"],
    select: { value: true, confidence: true, product: { select: { name: true, category: true } } },
  });
  console.log(`\nImported ${productIds.size} of ${entries.length} products. Overall score (confidence):`);
  for (const r of rows.sort((a, b) => b.confidence.comparedTo(a.confidence))) {
    console.log(`  ${r.confidence.toFixed(3)}  ${r.value.toFixed(1).padStart(5)}  ${r.product.name} [${r.product.category}]`);
  }
  if (failures.length) console.log(`\n${failures.length} page(s) couldn't be read:\n  ${failures.join("\n  ")}`);
  if (productIds.size === 0) process.exitCode = 1;
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
