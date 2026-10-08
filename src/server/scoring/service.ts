// Database side of the scoring engine: load evidence + offers, run the pure
// engine, store results. Takes the Prisma client as an argument so it runs the
// same way inside Next.js, the seed script, and tests.

import type { PrismaClient } from "@/generated/prisma/client";
import {
  bestCurrentOffer,
  calculateScores,
  METHODOLOGY_VERSION,
  type DimensionScore,
  type EvidenceFact,
  type OfferFact,
} from "./engine";

const OFFER_LOOKBACK_DAYS = 30;

type CategoryData = Awaited<ReturnType<typeof loadCategory>>;

async function loadCategory(db: PrismaClient, category: string, asOf: Date) {
  const offerSince = new Date(asOf.getTime() - OFFER_LOOKBACK_DAYS * 86_400_000);
  return db.product.findMany({
    where: { category },
    orderBy: { id: "asc" },
    select: {
      id: true,
      evidence: {
        where: { observedAt: { lte: asOf } },
        select: {
          id: true,
          sourceUrl: true,
          sourceType: true,
          observedAt: true,
          qualityScore: true,
          metric: true,
          metricValue: true,
        },
      },
      offers: {
        where: { observedAt: { gte: offerSince, lte: asOf } },
        select: { price: true, currency: true, availability: true, observedAt: true, sourceEvidenceId: true },
      },
    },
  });
}

const toEvidenceFacts = (rows: CategoryData[number]["evidence"]): EvidenceFact[] =>
  rows.map((e) => ({
    id: e.id,
    sourceUrl: e.sourceUrl,
    sourceType: e.sourceType,
    observedAt: e.observedAt,
    qualityScore: e.qualityScore.toNumber(),
    metric: e.metric,
    metricValue: e.metricValue?.toNumber() ?? null,
  }));

const toOfferFacts = (rows: CategoryData[number]["offers"]): OfferFact[] =>
  rows.map((o) => ({ ...o, price: o.price.toNumber() }));

/** Compute scores for one product without saving them. */
export function computeForProduct(products: CategoryData, productId: string, asOf: Date): DimensionScore[] {
  const categoryBestPrices = products.flatMap((p) => {
    const best = bestCurrentOffer(toOfferFacts(p.offers), asOf);
    return best ? [{ currency: best.currency, price: best.price }] : [];
  });
  const product = products.find((p) => p.id === productId);
  if (!product) throw new Error(`Product ${productId} not found in its category`);

  return calculateScores({
    asOf,
    evidence: toEvidenceFacts(product.evidence),
    offers: toOfferFacts(product.offers),
    categoryBestPrices,
  });
}

/**
 * Recalculate and store scores for every product in a category. Category-wide
 * because VALUE compares each product's price against its peers. Scores are
 * appended (history is kept); readers take the latest per dimension.
 */
export async function recalculateCategoryScores(db: PrismaClient, category: string, asOf: Date) {
  const products = await loadCategory(db, category, asOf);
  const results = products.map((p) => ({ productId: p.id, scores: computeForProduct(products, p.id, asOf) }));

  await db.$transaction(
    results.flatMap(({ productId, scores }) =>
      scores.map((s) =>
        db.productScore.create({
          data: {
            productId,
            dimension: s.dimension,
            value: s.value,
            confidence: s.confidence,
            methodologyVersion: METHODOLOGY_VERSION,
            calculatedAt: asOf,
            evidence: { create: s.evidenceIds.map((evidenceId) => ({ evidenceId })) },
          },
        }),
      ),
    ),
  );

  return results;
}
