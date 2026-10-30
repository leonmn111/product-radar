// Read model for products: latest score per dimension, offers, and the
// evidence behind them. Returns plain JSON-safe objects (no Prisma Decimals).

import { resaleRisk } from "@/components/dashboard/resellability";
import { isSellable } from "@/engine/compliance";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { marginInsight } from "@/server/margins/engine";
import { bestCurrentOffer, METHODOLOGY_VERSION } from "@/server/scoring/engine";
import { LATEST_FX } from "@/server/scoring/fx-latest";
import { catalogResellability } from "@/services/catalogMargin";
import { highestRrp } from "./rrp";
import { minimumMatch, type SearchTerm } from "./search";

const MAX_EVIDENCE_PER_PRODUCT = 50;

const PRODUCT_INCLUDE = {
  offers: {
    orderBy: [{ price: "asc" }, { observedAt: "desc" }],
    include: { sourceEvidence: { select: { qualityScore: true, sourceType: true, claim: true } } },
  },
  // Newest evidence only — re-ingests add rows, so an unbounded list would grow forever.
  evidence: { orderBy: [{ observedAt: "desc" }, { id: "asc" }], take: MAX_EVIDENCE_PER_PRODUCT },
  _count: { select: { evidence: true } },
  // Only scores from the current methodology: an older one is history, not shown. (v2.0.0 moved TREND to
  // Ad Momentum, so a product without ad data must not keep its old Google Trends score.)
  scores: {
    where: { methodologyVersion: METHODOLOGY_VERSION },
    orderBy: [{ dimension: "asc" }, { calculatedAt: "desc" }, { id: "desc" }],
    distinct: ["dimension"],
    include: { evidence: { select: { evidenceId: true, evidence: { select: { sourceUrl: true } } } } },
  },
} satisfies Prisma.ProductInclude;

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
      WHERE s."productId" = p.id AND s.dimension = 'OVERALL' AND s."methodologyVersion" = ${METHODOLOGY_VERSION}
      ORDER BY s."calculatedAt" DESC, s.id DESC
      LIMIT 1
    ) overall ON true
    WHERE (${category ?? null}::text IS NULL OR p.category = ${category ?? null})
      AND (${includeLive} OR p."isSample")
    ORDER BY overall.value DESC NULLS LAST, p.name ASC
    LIMIT ${limit}`;

  return (await loadInOrder(db, ranked, asOf)).map(({ dto }) => dto);
}

export type SearchProductsOptions = {
  terms: SearchTerm[];
  category?: string;
  limit: number;
  includeSample: boolean;
  asOf?: Date;
};

/**
 * Live products (and samples, if asked) whose name, brand, category or description
 * has a word starting with any of the search terms, ignoring case, covering at least
 * minimumMatch() of the query. Ranked by how much of the query matched (sum of matched
 * term weights), then by latest OVERALL score. Each result lists the query words it matched.
 */
export async function searchProducts(
  db: PrismaClient,
  { terms, category, limit, includeSample, asOf = new Date() }: SearchProductsOptions,
) {
  // One row per (word, pattern); patterns are letters and digits only, so safe inside a regex.
  const rows = terms.flatMap((t) => t.patterns.map((pattern) => ({ word: t.word, weight: t.weight, pattern })));
  if (rows.length === 0) return [];

  const ranked = await db.$queryRaw<{ id: string; matched: string[] }[]>`
    WITH term AS (
      SELECT * FROM unnest(
        ${rows.map((r) => r.word)}::text[],
        ${rows.map((r) => r.weight)}::float8[],
        ${rows.map((r) => r.pattern)}::text[]
      ) AS t(word, weight, pattern)
    ),
    hit AS (
      SELECT DISTINCT p.id, p.name, term.word, term.weight
      FROM "Product" p
      -- Match at the start of a word: "oven" finds "ovens", not "proven".
      JOIN term ON lower(concat_ws(' ', p.name, p.brand, p.category, p.description)) ~ ('(^|[^[:alnum:]])' || term.pattern)
      WHERE (${category ?? null}::text IS NULL OR p.category = ${category ?? null})
        AND (${includeSample} OR NOT p."isSample")
    )
    SELECT hit.id, array_agg(hit.word ORDER BY hit.weight DESC, hit.word) AS matched
    FROM hit
    LEFT JOIN LATERAL (
      SELECT s.value FROM "ProductScore" s
      WHERE s."productId" = hit.id AND s.dimension = 'OVERALL' AND s."methodologyVersion" = ${METHODOLOGY_VERSION}
      ORDER BY s."calculatedAt" DESC, s.id DESC
      LIMIT 1
    ) overall ON true
    GROUP BY hit.id, hit.name, overall.value
    HAVING sum(hit.weight) >= ${minimumMatch(terms)}
    ORDER BY sum(hit.weight) DESC, overall.value DESC NULLS LAST, hit.name ASC
    LIMIT ${limit}`;

  return (await loadInOrder(db, ranked, asOf)).map(({ dto, hit }) => ({ product: dto, matched: hit.matched }));
}

/** Categories that have products, with how many (live only, unless samples are asked for). */
export async function listCategories(db: PrismaClient, { includeSample }: { includeSample: boolean }) {
  const groups = await db.product.groupBy({
    by: ["category"],
    where: includeSample ? {} : { isSample: false },
    _count: { _all: true },
    orderBy: { category: "asc" },
  });
  return groups.map((g) => ({ category: g.category, products: g._count._all }));
}

/** Full products for ranked ids, in the same order. A product deleted in between is skipped. */
async function loadInOrder<T extends { id: string }>(db: PrismaClient, ranked: T[], asOf: Date) {
  if (ranked.length === 0) return [];
  const ids = ranked.map((r) => r.id);
  const [rows, sources] = await Promise.all([
    db.product.findMany({ where: { id: { in: ids } }, include: PRODUCT_INCLUDE }),
    sourceSummaries(db, ids),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ranked.flatMap((hit) => {
    const row = byId.get(hit.id);
    return row ? [{ hit, dto: toDto(row, asOf, sources.get(hit.id)) }] : [];
  });
}

/** One product by id (sample or live), or null if it doesn't exist. */
export async function getProduct(db: PrismaClient, id: string, asOf = new Date()) {
  const [row, sources] = await Promise.all([
    db.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE }),
    sourceSummaries(db, [id]),
  ]);
  return row ? toDto(row, asOf, sources.get(id)) : null;
}

/** One product by its URL slug (sample or live), or null if it doesn't exist. */
export async function getProductBySlug(db: PrismaClient, slug: string, asOf = new Date()) {
  const row = await db.product.findUnique({ where: { slug }, include: PRODUCT_INCLUDE });
  if (!row) return null;
  const sources = await sourceSummaries(db, [row.id]);
  return toDto(row, asOf, sources.get(row.id));
}

type SourceSummary = { sourceCount: number; hasSearchTrend: boolean };

/**
 * Per product, over ALL its evidence (not just the newest rows the DTO carries):
 * how many distinct pages it comes from — a page read twice, or 11 monthly trend
 * points from one chart, count once — and whether search-interest data exists.
 */
async function sourceSummaries(db: PrismaClient, productIds: string[]) {
  const groups = await db.evidence.groupBy({
    by: ["productId", "sourceUrl", "metric"],
    where: { productId: { in: productIds } },
  });
  const urls = new Map<string, Set<string>>();
  const trends = new Set<string>();
  for (const g of groups) {
    urls.set(g.productId, (urls.get(g.productId) ?? new Set()).add(g.sourceUrl));
    if (g.metric === "SEARCH_INTEREST") trends.add(g.productId);
  }
  return new Map<string, SourceSummary>(
    productIds.map((id) => [id, { sourceCount: urls.get(id)?.size ?? 0, hasSearchTrend: trends.has(id) }]),
  );
}

/** Only web image URLs reach the page (never data:, javascript: or relative ones). */
const webImage = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

type ProductRow = Prisma.ProductGetPayload<{
  include: {
    offers: { include: { sourceEvidence: { select: { qualityScore: true, sourceType: true, claim: true } } } };
    evidence: true;
    scores: { include: { evidence: { select: { evidenceId: true; evidence: { select: { sourceUrl: true } } } } } };
    _count: { select: { evidence: true } };
  };
}>;

function toDto(p: ProductRow, asOf: Date, sources: SourceSummary = { sourceCount: 0, hasSearchTrend: false }) {
  const offers = p.offers.map((o) => ({
    id: o.id,
    merchant: o.merchant,
    url: o.url,
    price: { amount: o.price.toFixed(2), currency: o.currency },
    availability: o.availability,
    observedAt: o.observedAt.toISOString(),
    sourceEvidenceId: o.sourceEvidenceId,
    // The evidence the price was captured from: how it's weighed for confidence, and what it says.
    source: { quality: o.sourceEvidence.qualityScore.toNumber(), type: o.sourceEvidence.sourceType, claim: o.sourceEvidence.claim },
    rrp: o.rrp ? o.rrp.toFixed(2) : null, // the page's own RRP for this listing, same currency
  }));

  const offerFacts = p.offers.map((o) => ({
    ...o,
    price: o.price.toNumber(),
    qualityScore: o.sourceEvidence.qualityScore.toNumber(),
  }));
  const best = bestCurrentOffer(offerFacts, asOf, LATEST_FX);
  const bestOffer = best ? offers.find((o) => o.sourceEvidenceId === best.sourceEvidenceId) ?? null : null;

  const resale = catalogResellability({ name: p.name, brand: p.brand, category: p.category, description: p.description, offers });

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
    imageUrl: webImage(p.imageUrl),
    isSample: p.isSample,
    bestOffer,
    // The highest RRP a store currently publishes, in the best offer's currency (or null).
    rrp: highestRrp(
      p.offers.map((o) => ({ ...o, rrp: o.rrp?.toNumber() ?? null })),
      bestOffer?.price.currency ?? null,
      asOf,
    ),
    // The resale checks (engine/compliance.ts) on the product's own text: a product that fails one gets no
    // money figures anywhere in the dossier (CLAUDE.md Rule 7).
    resellable: isSellable(resale),
    resaleRisk: resaleRisk(resale), // "ip" (High IP Risk), "compliance" (regulated goods) or null
    // Rule-based estimate from captured store prices only: the retail price and two resale price gaps
    // (src/server/margins). The UK landed margin is src/services/catalogMargin.ts.
    margin: marginInsight({ offers: offerFacts, asOf, fx: LATEST_FX }),
    scores: Object.fromEntries(
      p.scores.map((s) => [
        s.dimension,
        {
          value: s.value.toNumber(),
          confidence: s.confidence.toNumber(),
          methodologyVersion: s.methodologyVersion,
          calculatedAt: s.calculatedAt.toISOString(),
          evidenceIds: s.evidence.map((e) => e.evidenceId).sort(),
          // Distinct pages behind the score: one page read four times is one source.
          sourceCount: new Set(s.evidence.map((e) => e.evidence.sourceUrl)).size,
        },
      ]),
    ),
    offers,
    evidenceCount: p._count.evidence, // total; `evidence` holds the newest MAX_EVIDENCE_PER_PRODUCT
    ...sources,
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
