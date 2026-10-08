// Proves the Phase 2 schema rules hold against the real database.
// Creates throwaway rows, tries to break each rule, then deletes everything
// it created. Safe to re-run.  Usage: npm run db:verify
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const TAG = `verify-${Date.now()}`;
let failures = 0;

function pass(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string) {
  failures++;
  console.log(`  ✗ ${msg}`);
}

async function expectRejected(label: string, op: () => Promise<unknown>) {
  try {
    await op();
    fail(`${label} — was ACCEPTED (should be rejected)`);
  } catch {
    pass(`${label} — rejected`);
  }
}

async function usesIndex(label: string, sql: string, indexName: string) {
  // Tiny test tables make the planner prefer a full scan, so disable that to
  // check the index is *usable* for this query shape.
  const plan = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    return tx.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`EXPLAIN ${sql}`);
  });
  const text = plan.map((r) => r["QUERY PLAN"]).join("\n");
  if (text.includes(indexName)) pass(`${label} uses ${indexName}`);
  else fail(`${label} does not use ${indexName}:\n${text}`);
}

async function main() {
  console.log("Valid data");
  const product = await db.product.create({
    data: { slug: `${TAG}-kettle`, name: "Test Kettle", category: `${TAG}-kitchen` },
  });
  const other = await db.product.create({
    data: { slug: `${TAG}-toaster`, name: "Test Toaster", category: `${TAG}-kitchen` },
  });
  const evidence = await db.evidence.create({
    data: {
      productId: product.id,
      claim: "Listed at $49.99",
      sourceUrl: "https://example.com/kettle",
      sourceName: "Example Store",
      sourceType: "RETAILER",
      observedAt: new Date(),
      qualityScore: 82.5,
    },
  });
  await db.offer.create({
    data: {
      productId: product.id,
      sourceEvidenceId: evidence.id,
      merchant: "Example Store",
      url: "https://example.com/kettle",
      price: new Prisma.Decimal("49.99"),
      currency: "USD",
      availability: "IN_STOCK",
      observedAt: evidence.observedAt,
    },
  });
  const score = await db.productScore.create({
    data: {
      productId: product.id,
      dimension: "OVERALL",
      value: 74,
      confidence: 0.6,
      methodologyVersion: "v0-test",
      evidence: { create: [{ evidenceId: evidence.id }] },
    },
  });
  await db.user.create({ data: { email: `${TAG}@example.com` } });
  pass("product, evidence, offer, score (linked to evidence), user created");

  console.log("Evidence-First rules (database level)");
  const base = {
    productId: product.id,
    claim: "x",
    sourceUrl: "https://example.com",
    sourceName: "Example",
    sourceType: "OTHER" as const,
    observedAt: new Date(),
    qualityScore: 50,
  };
  await expectRejected("evidence quality score 101", () =>
    db.evidence.create({ data: { ...base, qualityScore: 101 } }),
  );
  await expectRejected("evidence quality score -1", () => db.evidence.create({ data: { ...base, qualityScore: -1 } }));
  await expectRejected("evidence with non-URL source", () =>
    db.evidence.create({ data: { ...base, sourceUrl: "somewhere online" } }),
  );
  await expectRejected("evidence with blank source name", () =>
    db.evidence.create({ data: { ...base, sourceName: "   " } }),
  );
  await expectRejected("evidence with blank claim", () => db.evidence.create({ data: { ...base, claim: "" } }));
  await expectRejected("evidence published after it was observed", () =>
    db.evidence.create({ data: { ...base, publishedAt: new Date(Date.now() + 86_400_000) } }),
  );
  await expectRejected("evidence missing timestamp (raw SQL NULL)", () =>
    db.$executeRaw`INSERT INTO "Evidence" (id, "productId", claim, "sourceUrl", "sourceName", "sourceType", "observedAt", "qualityScore")
      VALUES (gen_random_uuid(), ${product.id}::uuid, 'x', 'https://e.com', 'E', 'OTHER', NULL, 50)`,
  );

  console.log("Offer rules");
  await expectRejected("offer citing another product's evidence", () =>
    db.offer.create({
      data: {
        productId: other.id,
        sourceEvidenceId: evidence.id,
        merchant: "M",
        url: "https://e.com",
        price: 1,
        currency: "USD",
        observedAt: new Date(),
      },
    }),
  );
  await expectRejected("offer with negative price", () =>
    db.offer.create({
      data: {
        productId: product.id,
        sourceEvidenceId: evidence.id,
        merchant: "M",
        url: "https://e.com",
        price: -1,
        currency: "USD",
        observedAt: new Date(),
      },
    }),
  );
  await expectRejected("offer with lowercase currency", () =>
    db.offer.create({
      data: {
        productId: product.id,
        sourceEvidenceId: evidence.id,
        merchant: "M",
        url: "https://e.com",
        price: 1,
        currency: "usd",
        observedAt: new Date(),
      },
    }),
  );

  console.log("Score rules");
  const sbase = { productId: product.id, dimension: "VALUE" as const, value: 50, confidence: 0.5, methodologyVersion: "v0" };
  await expectRejected("score value 150", () => db.productScore.create({ data: { ...sbase, value: 150 } }));
  await expectRejected("score confidence 1.5", () => db.productScore.create({ data: { ...sbase, confidence: 1.5 } }));
  await expectRejected("deleting evidence a score depends on", () => db.evidence.delete({ where: { id: evidence.id } }));

  console.log("Other rules");
  await expectRejected("product with mixed-case category", () =>
    db.product.create({ data: { slug: `${TAG}-x`, name: "X", category: "Kitchen" } }),
  );
  await expectRejected("duplicate user email", () => db.user.create({ data: { email: `${TAG}@example.com` } }));

  console.log("Indexes");
  await usesIndex(
    "filter by category",
    `SELECT * FROM "Product" WHERE category = '${TAG}-kitchen'`,
    "Product_category",
  );
  await usesIndex(
    "top products by OVERALL score",
    `SELECT * FROM "ProductScore" WHERE dimension = 'OVERALL' ORDER BY value DESC LIMIT 20`,
    "ProductScore_dimension_value_idx",
  );
  await usesIndex(
    "latest score for a product",
    `SELECT * FROM "ProductScore" WHERE "productId" = '${product.id}' AND dimension = 'OVERALL' ORDER BY "calculatedAt" DESC LIMIT 1`,
    "ProductScore_productId_dimension_calculatedAt_idx",
  );

  console.log("Cleanup");
  await db.product.deleteMany({ where: { slug: { startsWith: TAG } } });
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } });
  const leftovers = await db.evidence.count({ where: { productId: product.id } });
  const scoreLeft = await db.productScore.count({ where: { id: score.id } });
  if (leftovers === 0 && scoreLeft === 0) pass("deleting a product removes its evidence, offers and scores");
  else fail(`cleanup left ${leftovers} evidence / ${scoreLeft} scores behind`);
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(async () => {
    await db.$disconnect();
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  });
