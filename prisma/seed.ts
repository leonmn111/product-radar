// Seeds 5 SAMPLE products with offers, evidence and calculated scores.
//
// Evidence-First (CLAUDE.md Rule 3): this is demo data, not research. Brands
// are fictional, every source URL is on the reserved example.com domain, and
// every product/evidence row is flagged isSample = true so it can never be
// mistaken for a real capture. Scores are NOT hard-coded — they are computed
// by the scoring engine from this evidence, exactly as real data will be.
//
// Idempotent: deletes previous sample rows, then re-inserts.
// Usage: npm run db:seed

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Availability, EvidenceMetric, SourceType } from "@/generated/prisma/enums";
import { EvidenceInput } from "@/lib/validation/evidence";
import { recalculateCategoryScores } from "@/server/scoring/service";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed sample data with NODE_ENV=production.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const asOf = new Date();
const daysAgo = (d: number) => new Date(asOf.getTime() - d * 86_400_000);

type SeedEvidence = {
  claim: string;
  source: { name: string; url: string; type: SourceType };
  daysAgo: number;
  quality: number;
  metric?: EvidenceMetric;
  value?: number;
};
type SeedOffer = { merchant: string; url: string; price: string; availability: Availability; daysAgo: number };
type SeedProduct = {
  slug: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  evidence: SeedEvidence[];
  offers: SeedOffer[];
};

const REVIEWS = (path: string) => ({ name: "Sample Review Lab", url: `https://reviews.example.com/${path}`, type: "REVIEW" as const });
const MARKET = (path: string) => ({ name: "Sample Marketplace", url: `https://marketplace.example.com/${path}`, type: "MARKETPLACE" as const });
const FORUM = (path: string) => ({ name: "Sample Community Forum", url: `https://forum.example.com/${path}`, type: "FORUM" as const });
const TRENDS = (path: string) => ({ name: "Sample Search Trends", url: `https://trends.example.com/${path}`, type: "OTHER" as const });

// Search interest series: [daysAgo, index]
const trend = (slug: string, series: [number, number][]): SeedEvidence[] =>
  series.map(([d, v]) => ({
    claim: `Relative search interest index ${v}/100`,
    source: TRENDS(slug),
    daysAgo: d,
    quality: 70,
    metric: "SEARCH_INTEREST",
    value: v,
  }));

const PRODUCTS: SeedProduct[] = [
  {
    slug: "sample-aurora-pods-pro",
    name: "Aurora Pods Pro",
    brand: "Aurora Audio (sample)",
    category: "wireless-earbuds",
    description: "Noise-cancelling true-wireless earbuds with 8-hour battery life.",
    evidence: [
      { claim: "Average rating 4.6 / 5 across lab and user tests", source: REVIEWS("aurora-pods-pro"), daysAgo: 12, quality: 88, metric: "RATING", value: 4.6 },
      { claim: "Average rating 4.5 / 5 from verified buyers", source: MARKET("aurora-pods-pro"), daysAgo: 3, quality: 75, metric: "RATING", value: 4.5 },
      { claim: "12,400 verified buyer ratings", source: MARKET("aurora-pods-pro"), daysAgo: 3, quality: 80, metric: "REVIEW_COUNT", value: 12400 },
      { claim: "Discussion sentiment strongly positive (net +0.55)", source: FORUM("aurora-pods-pro"), daysAgo: 6, quality: 60, metric: "SENTIMENT", value: 0.55 },
      { claim: "Reviewers note noise cancelling rivals pricier models", source: REVIEWS("aurora-pods-pro#anc"), daysAgo: 12, quality: 85 },
      ...trend("aurora-pods-pro", [[84, 52], [56, 58], [28, 63], [2, 70]]),
    ],
    offers: [
      { merchant: "Sample Electronics Store", url: "https://shop.example.com/aurora-pods-pro", price: "179.00", availability: "IN_STOCK", daysAgo: 1 },
      { merchant: "Sample Marketplace", url: "https://marketplace.example.com/aurora-pods-pro", price: "169.99", availability: "IN_STOCK", daysAgo: 2 },
    ],
  },
  {
    slug: "sample-kestrel-buds-lite",
    name: "Kestrel Buds Lite",
    brand: "Kestrel (sample)",
    category: "wireless-earbuds",
    description: "Budget everyday earbuds with IPX4 sweat resistance.",
    evidence: [
      { claim: "Average rating 4.1 / 5 in lab test", source: REVIEWS("kestrel-buds-lite"), daysAgo: 20, quality: 85, metric: "RATING", value: 4.1 },
      { claim: "Average rating 4.2 / 5 from verified buyers", source: MARKET("kestrel-buds-lite"), daysAgo: 4, quality: 75, metric: "RATING", value: 4.2 },
      { claim: "3,200 verified buyer ratings", source: MARKET("kestrel-buds-lite"), daysAgo: 4, quality: 80, metric: "REVIEW_COUNT", value: 3200 },
      { claim: "Discussion sentiment mildly positive (net +0.20)", source: FORUM("kestrel-buds-lite"), daysAgo: 9, quality: 55, metric: "SENTIMENT", value: 0.2 },
      ...trend("kestrel-buds-lite", [[84, 30], [56, 31], [28, 29], [2, 30]]),
    ],
    offers: [
      { merchant: "Sample Electronics Store", url: "https://shop.example.com/kestrel-buds-lite", price: "59.00", availability: "IN_STOCK", daysAgo: 1 },
      { merchant: "Sample Discount Outlet", url: "https://outlet.example.com/kestrel-buds-lite", price: "54.50", availability: "OUT_OF_STOCK", daysAgo: 2 },
    ],
  },
  {
    slug: "sample-nimbus-sound-air",
    name: "Nimbus Sound Air",
    brand: "Nimbus (sample)",
    category: "wireless-earbuds",
    description: "Open-fit earbuds aimed at runners.",
    evidence: [
      { claim: "Average rating 3.7 / 5 in lab test", source: REVIEWS("nimbus-sound-air"), daysAgo: 30, quality: 82, metric: "RATING", value: 3.7 },
      { claim: "860 verified buyer ratings", source: MARKET("nimbus-sound-air"), daysAgo: 5, quality: 80, metric: "REVIEW_COUNT", value: 860 },
      { claim: "Discussion sentiment slightly negative (net -0.10), mostly fit complaints", source: FORUM("nimbus-sound-air"), daysAgo: 10, quality: 55, metric: "SENTIMENT", value: -0.1 },
      ...trend("nimbus-sound-air", [[84, 40], [56, 36], [28, 31], [2, 25]]),
    ],
    offers: [
      { merchant: "Sample Electronics Store", url: "https://shop.example.com/nimbus-sound-air", price: "129.00", availability: "IN_STOCK", daysAgo: 1 },
    ],
  },
  {
    slug: "sample-brava-compact-espresso",
    name: "Brava Compact Espresso",
    brand: "Brava (sample)",
    category: "espresso-machines",
    description: "Small-footprint pump espresso machine with steam wand.",
    evidence: [
      { claim: "Average rating 4.4 / 5 in lab test", source: REVIEWS("brava-compact"), daysAgo: 15, quality: 90, metric: "RATING", value: 4.4 },
      { claim: "Average rating 4.3 / 5 from verified buyers", source: MARKET("brava-compact"), daysAgo: 3, quality: 75, metric: "RATING", value: 4.3 },
      { claim: "2,100 verified buyer ratings", source: MARKET("brava-compact"), daysAgo: 3, quality: 80, metric: "REVIEW_COUNT", value: 2100 },
      { claim: "Discussion sentiment positive (net +0.40)", source: FORUM("brava-compact"), daysAgo: 7, quality: 60, metric: "SENTIMENT", value: 0.4 },
      ...trend("brava-compact", [[84, 45], [56, 47], [28, 48], [2, 50]]),
    ],
    offers: [
      { merchant: "Sample Kitchen Supply", url: "https://kitchen.example.com/brava-compact", price: "349.00", availability: "IN_STOCK", daysAgo: 1 },
      { merchant: "Sample Marketplace", url: "https://marketplace.example.com/brava-compact", price: "339.95", availability: "PREORDER", daysAgo: 2 },
    ],
  },
  {
    slug: "sample-caffe-uno-manual-lever",
    name: "Caffè Uno Manual Lever",
    brand: "Caffè Uno (sample)",
    category: "espresso-machines",
    description: "Hand-operated lever espresso maker, no electricity needed.",
    evidence: [
      { claim: "Average rating 4.0 / 5 in lab test", source: REVIEWS("caffe-uno-lever"), daysAgo: 40, quality: 80, metric: "RATING", value: 4.0 },
      { claim: "410 verified buyer ratings", source: MARKET("caffe-uno-lever"), daysAgo: 6, quality: 80, metric: "REVIEW_COUNT", value: 410 },
      { claim: "Discussion sentiment positive (net +0.30) among enthusiasts", source: FORUM("caffe-uno-lever"), daysAgo: 14, quality: 50, metric: "SENTIMENT", value: 0.3 },
      // Only one search data point ⇒ the engine produces no TREND score (by design).
      ...trend("caffe-uno-lever", [[5, 18]]),
    ],
    offers: [
      { merchant: "Sample Kitchen Supply", url: "https://kitchen.example.com/caffe-uno-lever", price: "219.00", availability: "IN_STOCK", daysAgo: 2 },
    ],
  },
];

async function main() {
  const removed = await db.product.deleteMany({ where: { isSample: true } });
  if (removed.count) console.log(`Removed ${removed.count} previous sample products.`);

  for (const p of PRODUCTS) {
    const product = await db.product.create({
      data: { slug: p.slug, name: p.name, brand: p.brand, category: p.category, description: p.description, isSample: true },
    });

    for (const e of p.evidence) {
      // Same validator real ingestion will use — sample data gets no shortcuts.
      const valid = EvidenceInput.parse({
        productId: product.id,
        claim: e.claim,
        sourceUrl: e.source.url,
        sourceName: e.source.name,
        sourceType: e.source.type,
        observedAt: daysAgo(e.daysAgo),
        qualityScore: e.quality,
        metric: e.metric,
        metricValue: e.value,
      });
      await db.evidence.create({ data: { ...valid, isSample: true } });
    }

    for (const o of p.offers) {
      const observedAt = daysAgo(o.daysAgo);
      const source = await db.evidence.create({
        data: {
          productId: product.id,
          claim: `Listed at $${o.price} (${o.availability.toLowerCase().replace("_", " ")})`,
          sourceUrl: o.url,
          sourceName: o.merchant,
          sourceType: "RETAILER",
          observedAt,
          qualityScore: 90,
          isSample: true,
        },
      });
      await db.offer.create({
        data: {
          productId: product.id,
          sourceEvidenceId: source.id,
          merchant: o.merchant,
          url: o.url,
          price: o.price,
          currency: "USD",
          availability: o.availability,
          observedAt,
        },
      });
    }
  }

  const categories = [...new Set(PRODUCTS.map((p) => p.category))];
  for (const category of categories) {
    const results = await recalculateCategoryScores(db, category, asOf);
    for (const r of results) {
      const { name } = await db.product.findUniqueOrThrow({ where: { id: r.productId }, select: { name: true } });
      const summary = r.scores.map((s) => `${s.dimension} ${s.value} (conf ${s.confidence})`).join(", ");
      console.log(`  ${name}: ${summary}`);
    }
  }

  console.log(`Seeded ${PRODUCTS.length} sample products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
