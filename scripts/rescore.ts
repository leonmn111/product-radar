// Recalculates scores for every category (e.g. after a methodology change).
// Scores are appended — older calculations stay as history.
// Usage: npm run db:rescore
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { METHODOLOGY_VERSION } from "../src/server/scoring/engine";
import { recalculateCategoryScores } from "../src/server/scoring/service";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

(async () => {
  const asOf = new Date();
  const categories = await db.product.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } });
  for (const { category } of categories) {
    const results = await recalculateCategoryScores(db, category, asOf);
    console.log(`  ${category}: ${results.length} product(s) rescored`);
  }
  console.log(`Done — methodology v${METHODOLOGY_VERSION}.`);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
