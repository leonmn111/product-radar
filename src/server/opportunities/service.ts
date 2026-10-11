// Product opportunities for machine consumers (AI agents). Pure domain code:
// reads products, evidence and scores — knows nothing about how the caller paid.

import type { PrismaClient } from "@/generated/prisma/client";
import { parseSearch, toCategorySlug } from "@/server/products/search";
import { listCategories, listProducts, searchProducts, type ProductDto } from "@/server/products/service";
import { METHODOLOGY_VERSION } from "@/server/scoring/engine";

/** `q` is plain words ("wireless earbuds"); `category` may be a slug or plain words too. */
export type OpportunityQuery = { q?: string; category?: string; limit: number; includeSample: boolean };

const TOP_EVIDENCE = 5;

function toOpportunity(p: ProductDto, rank: number, matched?: string[]) {
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
    ...(matched ? { matchedWords: matched } : {}),
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

function noResultsHint(words: string[], categories: { category: string; products: number }[]) {
  const searched = words.length > 0 ? ` matched "${words.join(" ")}"` : " were found";
  const list = categories.map((c) => `${c.category} (${c.products})`).join(", ");
  // No closing full stop: MCP clients append their own sentence after it.
  return `No products${searched}. Try fewer or broader words${list ? `, or one of these categories: ${list}` : ""}`;
}

export async function getOpportunities(db: PrismaClient, q: OpportunityQuery) {
  const categories = await listCategories(db, { includeSample: q.includeSample });

  // A category filters only when it names one that has products. Anything else
  // ("wireless earbuds", or a category with only demo products) is searched for
  // like the query words, so a guessed category still finds what it describes.
  const slug = q.category ? toCategorySlug(q.category) : "";
  const category = categories.some((c) => c.category === slug) ? slug : undefined;
  const terms = parseSearch([q.q, category ? "" : q.category].filter(Boolean).join(" "));

  let results: { product: ProductDto; matched?: string[] }[];
  if (terms.length > 0) {
    results = await searchProducts(db, { terms, category, limit: q.limit, includeSample: q.includeSample });
  } else {
    // Over-fetch when sample rows must be filtered out after ranking.
    const products = await listProducts(db, { category, limit: q.includeSample ? q.limit : 50, includeLive: true });
    results = products
      .filter((p) => q.includeSample || !p.isSample)
      .slice(0, q.limit)
      .map((product) => ({ product }));
  }

  return {
    generatedAt: new Date().toISOString(),
    methodologyVersion: METHODOLOGY_VERSION,
    disclaimer:
      "opportunityScore is a calculated estimate (0–100) with a confidence (0–1), derived only from the cited evidence. It is not a guarantee.",
    query: q,
    interpretedAs: { category: category ?? null, searchWords: terms.map((t) => t.word) },
    count: results.length,
    ...(results.length === 0 ? { hint: noResultsHint(terms.map((t) => t.word), categories) } : {}),
    availableCategories: categories,
    opportunities: results.map((r, i) => toOpportunity(r.product, i + 1, r.matched)),
  };
}
