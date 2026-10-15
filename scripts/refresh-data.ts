// Weekly data refresh: re-reads every live product's store pages so prices, stock, RRPs
// and store ratings stay inside the 30-day window the site trusts an offer for. Without
// it, every price drops out a month after the last import.
//
// The pages come from the database itself: each live product's own page plus every other
// store page it has an offer from, so products added from the dashboard are included.
// Expert reviews are not re-read: they don't change. Every fact is captured again by the
// same ingest code, as new evidence with its own source, time and quality (CLAUDE.md
// Rule 3); nothing is carried forward. Scores are recalculated as pages are saved.
//
// Runs on Railway as the "refresh" cron service (every Monday), followed by the Google
// Trends update, which only spends searches when a new month is available.
//
// Usage: npm run data:refresh                        (refresh, then the Trends update)
//        npx tsx scripts/refresh-data.ts --dry-run   (list the pages that would be read; reads nothing)
import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { FetchPageError } from "../src/server/ingest/fetch-page";
import { IngestError, ingestUrl } from "../src/server/ingest/ingest";

const PAUSE_MS = 1_000; // be gentle with the sites we read
// Some stores block servers now and then; most failing at once means something is wrong here.
const MAX_FAILURE_SHARE = 0.5;

const { values: flags } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));
const reason = (e: unknown) =>
  e instanceof FetchPageError || e instanceof IngestError ? e.message : e instanceof Error ? `unexpected: ${e.message}` : String(e);

(async () => {
  const started = Date.now();
  const products = await db.product.findMany({
    where: { isSample: false, url: { not: null } },
    select: { id: true, name: true, url: true, offers: { select: { url: true }, distinct: ["url"] } },
    orderBy: { name: "asc" },
  });
  const plan = products.map((p) => ({ ...p, stores: p.offers.map((o) => o.url).filter((u) => u !== p.url) }));
  const pageCount = plan.reduce((n, p) => n + 1 + p.stores.length, 0);
  console.log(`Refreshing ${products.length} live products, ${pageCount} store pages.`);

  if (flags["dry-run"]) {
    for (const p of plan) console.log(`  ${p.name}\n    ${[p.url, ...p.stores].join("\n    ")}`);
    return;
  }

  const failures: string[] = [];
  let read = 0;
  let prices = 0;
  for (const p of plan) {
    for (const url of [p.url!, ...p.stores]) {
      try {
        // The product's own page refreshes the product; other stores are added to it as sources.
        const r = await ingestUrl(db, url === p.url ? { url } : { url, productId: p.id });
        read++;
        if (r.offerCreated) prices++;
        const x = r.extracted;
        const facts = [x.price && `${x.price.amount} ${x.price.currency}`, x.rrp && `RRP ${x.rrp.amount}`].filter(Boolean).join(", ");
        console.log(`✓ ${new URL(url).hostname.padEnd(28)} ${p.name}${facts ? ` — ${facts}` : " — no price on the page"}`);
      } catch (e) {
        failures.push(`${url}: ${reason(e)}`);
        console.log(`✗ ${new URL(url).hostname.padEnd(28)} ${p.name} — ${reason(e)}`);
      }
      await pause();
    }
  }

  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(`\nRead ${read} of ${pageCount} pages (${prices} with a current price) in ${minutes} min.`);
  if (failures.length) console.log(`${failures.length} page(s) couldn't be read:\n  ${failures.join("\n  ")}`);
  if (pageCount > 0 && failures.length / pageCount > MAX_FAILURE_SHARE) {
    console.error(`More than ${MAX_FAILURE_SHARE * 100}% of pages failed: marking this run as failed.`);
    process.exitCode = 1;
  }
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
