// Daily Ad Momentum run (Phase 3, the Viral Demand Engine): watches every live catalog product on the
// Meta Ad Library, records today's snapshot for each watch that's due, then rescores the categories whose
// AD_ACTIVE_ADS evidence changed, so their TREND score follows the ads (scoring v2.0.0).
//
// Meta allows about 200 calls an hour and a check spends up to 3 (one per page), so a run checks at most
// --max watches (default 50), oldest first; the rest wait for the next run. A Meta rate limit pauses every
// further call (the adapter stops calling), and a failed check stores nothing.
//
// While META_AD_LIBRARY_ACCESS_TOKEN is missing or a placeholder (e.g. TEMP_WAITING_ON_META), it changes
// nothing and says "Ad data pending Meta approval". Schedule it as a daily Railway cron once the token is real.
//
// Usage: npm run ads:momentum              (npx tsx scripts/ad-momentum.ts [--max 50])

import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { recalculateCategoryScores } from "../src/server/scoring/service";
import { createMetaAdLibrarySource } from "../src/server/sources/metaAds/library";
import { AD_DATA_PENDING, adLibraryTokenPending } from "../src/server/sources/metaAds/token";
import { recordAdSnapshot, watchCatalogProducts, WATCH_DUE_AFTER_MS, type RecordOutcome } from "../src/services/adMomentumStore";

const { values } = parseArgs({ options: { max: { type: "string", default: "50" } } });
const max = Math.max(1, Number(values.max) || 50);
const token = process.env.META_AD_LIBRARY_ACCESS_TOKEN;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

(async () => {
  if (!token || adLibraryTokenPending(token)) {
    console.log(`${AD_DATA_PENDING}: META_AD_LIBRARY_ACCESS_TOKEN isn't set to a real token yet. Nothing was checked.`);
    return;
  }
  const source = createMetaAdLibrarySource({ accessToken: token });
  const created = await watchCatalogProducts(db);
  const due = await db.adWatch.findMany({
    where: { active: true, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - WATCH_DUE_AFTER_MS) } }] },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: max,
  });
  console.log(`Ad Momentum: ${created} new watch(es); checking ${due.length} due of up to ${max}.`);

  const tally: Record<RecordOutcome, number> = { recorded: 0, pending: 0, failed: 0, already_today: 0 };
  const categories = new Set<string>();
  for (const watch of due) {
    const { outcome, category } = await recordAdSnapshot(db, watch, { source });
    tally[outcome]++;
    if (category) categories.add(category);
    console.log(`  ${outcome.padEnd(13)} ${watch.searchTerms}`);
  }
  for (const category of categories) await recalculateCategoryScores(db, category, new Date());
  console.log(`Recorded ${tally.recorded}, failed ${tally.failed}, already done today ${tally.already_today}; rescored ${categories.size} categor${categories.size === 1 ? "y" : "ies"}.`);
  if (tally.failed > 0 && tally.recorded === 0) process.exitCode = 1; // nothing worked: something is wrong
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
