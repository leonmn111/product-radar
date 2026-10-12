// The Opportunity Dossier for machine consumers (AI agents): the same
// rule-based verdict, profit maths and supplier search the dashboard shows,
// plus every score and the evidence behind it. Pure domain code — knows
// nothing about how the caller paid.

import type { PrismaClient } from "@/generated/prisma/client";
import {
  cleanTitle,
  DEFAULT_WHOLESALE_SHARE,
  defaultWholesale,
  estimateProfit,
  opportunityVerdict,
  shopifyCsv,
  sourcingKeywords,
  supplierSearchUrls,
} from "@/components/dashboard/dossier";
import { confidenceLevel } from "@/components/dashboard/format";
import { getProduct, type ProductDto } from "@/server/products/service";
import { METHODOLOGY_VERSION } from "@/server/scoring/engine";

function profitBeforeCosts(price: number, wholesale: number) {
  const { net, marginPct } = estimateProfit(price, wholesale, 0);
  return { netProfitPerUnit: net, marginPct };
}

export function buildDossier(p: ProductDto, now = new Date()) {
  const offer = p.bestOffer;
  const merchant = offer?.merchant ?? null;
  const price = offer ? Number(offer.price.amount) : null;
  const wholesale = price !== null ? defaultWholesale(price) : null;
  const verdict = opportunityVerdict(p);
  const keywords = sourcingKeywords({ ...p, merchant });

  return {
    generatedAt: now.toISOString(),
    methodologyVersion: METHODOLOGY_VERSION,
    disclaimer:
      "Scores, the verdict and the profit figures are rule-based estimates calculated only from the cited evidence. They are not guarantees.",
    product: {
      id: p.id,
      name: cleanTitle(p.name, merchant),
      originalTitle: p.name,
      brand: p.brand,
      category: p.category,
      description: p.description,
      isSample: p.isSample,
    },
    verdict: verdict && {
      kind: verdict.kind,
      label: verdict.label,
      summary: verdict.sentences.join(" "),
      confidence: verdict.confidence,
      confidenceLevel: confidenceLevel(verdict.confidence),
      sourceCount: verdict.evidenceCount, // public API name kept; it counts evidence items behind the verdict
      method: "rule-based",
    },
    scores: Object.fromEntries(
      Object.entries(p.scores).map(([dimension, s]) => [
        dimension.toLowerCase(),
        {
          value: s.value,
          confidence: s.confidence,
          confidenceLevel: confidenceLevel(s.confidence),
          calculatedAt: s.calculatedAt,
          methodologyVersion: s.methodologyVersion,
          evidenceIds: s.evidenceIds,
        },
      ]),
    ),
    bestOffer: offer,
    offers: p.offers,
    profitEstimate:
      offer && price !== null && wholesale !== null
        ? {
            currency: offer.price.currency,
            retailPrice: price,
            retailPriceSource: { merchant: offer.merchant, url: offer.url, observedAt: offer.observedAt },
            assumedWholesaleCost: wholesale,
            ...profitBeforeCosts(price, wholesale),
            assumptions: [
              `Wholesale cost assumed at ${DEFAULT_WHOLESALE_SHARE * 100}% of the retail price: replace it with a real supplier quote.`,
              "Advertising, shipping, platform fees and taxes are not included.",
            ],
          }
        : null,
    sourcing: {
      keywords,
      searchUrls: supplierSearchUrls(keywords),
      note: "Search links only: ProductRadar has not vetted any supplier.",
    },
    shopifyImportCsv: shopifyCsv({ ...p, merchant }, { price, costPerItem: wholesale }),
    evidence: {
      count: p.evidenceCount,
      included: p.evidence.length, // the newest 50
      items: p.evidence.map((e) => ({
        id: e.id,
        claim: e.claim,
        sourceUrl: e.source.url,
        sourceName: e.source.name,
        sourceType: e.source.type,
        observedAt: e.observedAt,
        publishedAt: e.publishedAt,
        qualityScore: e.qualityScore,
        metric: e.metric,
      })),
    },
  };
}

export async function getDossier(db: PrismaClient, productId: string) {
  const product = await getProduct(db, productId);
  return product ? buildDossier(product) : null;
}
