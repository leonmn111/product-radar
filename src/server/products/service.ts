// Read model for products: latest score per dimension, offers, and the
// evidence behind them. Returns plain JSON-safe objects (no Prisma Decimals).

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { bestCurrentOffer } from "@/server/scoring/engine";

const MAX_EVIDENCE_PER_PRODUCT = 50;

export type ListProductsOptions = { category?: string; limit: number; includeLive: boolean; asOf?: Date };

export async function listProducts(
  db: PrismaClient,
  { category, limit, includeLive, asOf = new Date() }: ListProductsOptions,
) {
  // Rank by latest OVERALL score (uses ProductScore_productId_dimension_calculatedAt_idx).
  const ranked = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id
    FROM "Product" p
    LEFT JOIN LATERAL (
      SELECT s.value FROM "ProductScore" s
      WHERE s."productId" = p.id AND s.dimension = 'OVERALL'
      ORDER BY s."calculatedAt" DESC, s.id DESC
      LIMIT 1
    ) overall ON true
    WHERE (${category ?? null}::text IS NULL OR p.category = ${category ?? null})
      AND (${includeLive} OR p."isSample")
    ORDER BY overall.value DESC NULLS LAST, p.name ASC
    LIMIT ${limit}`;

  const ids = ranked.map((r) => r.id);
  if (ids.length === 0) return [];

  const rows = await db.product.findMany({
    where: { id: { in: ids } },
    include: {
      offers: { orderBy: [{ price: "asc" }, { observedAt: "desc" }] },
      // Newest evidence only — re-ingests add rows, so an unbounded list would grow forever.
      evidence: { orderBy: [{ observedAt: "desc" }, { id: "asc" }], take: MAX_EVIDENCE_PER_PRODUCT },
      _count: { select: { evidence: true } },
      scores: {
        orderBy: [{ dimension: "asc" }, { calculatedAt: "desc" }, { id: "desc" }],
        distinct: ["dimension"],
        include: { evidence: { select: { evidenceId: true } } },
      },
    },
  });

  // A product deleted between the two queries is simply skipped.
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toDto(row, asOf)] : [];
  });
}

/** How many live products exist that this viewer can't see (for the upgrade prompt). */
export async function countHiddenLiveProducts(db: PrismaClient, category?: string) {
  return db.product.count({ where: { isSample: false, ...(category ? { category } : {}) } });
}

type ProductRow = Prisma.ProductGetPayload<{
  include: {
    offers: true;
    evidence: true;
    scores: { include: { evidence: { select: { evidenceId: true } } } };
    _count: { select: { evidence: true } };
  };
}>;

function toDto(p: ProductRow, asOf: Date) {
  const offers = p.offers.map((o) => ({
    id: o.id,
    merchant: o.merchant,
    url: o.url,
    price: { amount: o.price.toFixed(2), currency: o.currency },
    availability: o.availability,
    observedAt: o.observedAt.toISOString(),
    sourceEvidenceId: o.sourceEvidenceId,
  }));

  const best = bestCurrentOffer(
    p.offers.map((o) => ({ ...o, price: o.price.toNumber() })),
    asOf,
  );
  const bestOffer = best ? offers.find((o) => o.sourceEvidenceId === best.sourceEvidenceId) ?? null : null;

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
    isSample: p.isSample,
    bestOffer,
    scores: Object.fromEntries(
      p.scores.map((s) => [
        s.dimension,
        {
          value: s.value.toNumber(),
          confidence: s.confidence.toNumber(),
          methodologyVersion: s.methodologyVersion,
          calculatedAt: s.calculatedAt.toISOString(),
          evidenceIds: s.evidence.map((e) => e.evidenceId).sort(),
        },
      ]),
    ),
    offers,
    evidenceCount: p._count.evidence, // total; `evidence` holds the newest MAX_EVIDENCE_PER_PRODUCT
    evidence: p.evidence.map((e) => ({
      id: e.id,
      claim: e.claim,
      source: { name: e.sourceName, url: e.sourceUrl, type: e.sourceType },
      observedAt: e.observedAt.toISOString(),
      publishedAt: e.publishedAt?.toISOString() ?? null,
      qualityScore: e.qualityScore.toNumber(),
      metric: e.metric && e.metricValue ? { type: e.metric, value: e.metricValue.toNumber() } : null,
      isSample: e.isSample,
    })),
  };
}

export type ProductDto = ReturnType<typeof toDto>;
