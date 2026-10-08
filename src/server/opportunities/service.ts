// Product opportunities for machine consumers (AI agents). Pure domain code:
// reads products, evidence and scores — knows nothing about how the caller paid.

import type { PrismaClient } from "@/generated/prisma/client";
import { listProducts, type ProductDto } from "@/server/products/service";
import { METHODOLOGY_VERSION } from "@/server/scoring/engine";

export type OpportunityQuery = { category?: string; limit: number; includeSample: boolean };

const TOP_EVIDENCE = 5;

function toOpportunity(p: ProductDto, rank: number) {
  const overall = p.scores.OVERALL;
  const observed = p.evidence.map((e) => e.observedAt).sort();
  return {
    rank,
    product: {
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      isSample: p.isSample,
    },
    opportunityScore: overall
      ? { value: overall.value, confidence: overall.confidence, calculatedAt: overall.calculatedAt }
      : null,
    dimensions: Object.fromEntries(
      Object.entries(p.scores)
        .filter(([d]) => d !== "OVERALL")
        .map(([d, s]) => [d.toLowerCase(), { value: s.value, confidence: s.confidence }]),
    ),
    bestOffer: p.bestOffer
      ? {
          merchant: p.bestOffer.merchant,
          url: p.bestOffer.url,
          price: p.bestOffer.price,
          availability: p.bestOffer.availability,
          observedAt: p.bestOffer.observedAt,
        }
      : null,
    evidence: {
      count: p.evidenceCount,
      oldestObservedAt: observed[0] ?? null,
      newestObservedAt: observed.at(-1) ?? null,
      top: [...p.evidence]
        .sort((a, b) => b.qualityScore - a.qualityScore || b.observedAt.localeCompare(a.observedAt))
        .slice(0, TOP_EVIDENCE)
        .map((e) => ({
          claim: e.claim,
          sourceUrl: e.source.url,
          sourceName: e.source.name,
          sourceType: e.source.type,
          observedAt: e.observedAt,
          qualityScore: e.qualityScore,
          metric: e.metric,
        })),
    },
  };
}

export async function getOpportunities(db: PrismaClient, q: OpportunityQuery) {
  // Over-fetch when sample rows must be filtered out after ranking.
  const products = await listProducts(db, { category: q.category, limit: q.includeSample ? q.limit : 50, includeLive: true });
  const ranked = products.filter((p) => q.includeSample || !p.isSample).slice(0, q.limit);
  return {
    generatedAt: new Date().toISOString(),
    methodologyVersion: METHODOLOGY_VERSION,
    disclaimer:
      "opportunityScore is a calculated estimate (0–100) with a confidence (0–1), derived only from the cited evidence. It is not a guarantee.",
    query: q,
    count: ranked.length,
    opportunities: ranked.map((p, i) => toOpportunity(p, i + 1)),
  };
}
