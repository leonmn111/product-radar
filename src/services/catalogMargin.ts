// The UK landed margin for a v1 catalog product (the "View dossier" page), built with the same engine
// and rules as the v2 Dossier (services/dossierService.ts), from the catalog's own captured prices:
//
//   1. Resellability first (engine/compliance.ts), recorded with every result. A High IP Risk product (a
//      brand or trademark) isn't held back: its suppliers are similar, unbranded alternatives (step 3).
//   2. Retail price: the median of the stores' current UK (GBP) prices, each citing its capture.
//   3. Supplier cost: the median of the live AliExpress offers that match. One budgeted, timed-out call,
//      cached for a day per search term. A failed search is never cached and never read as "no supplier".
//        - Most products: an exact match, 80% of the product's key words (live/match.ts).
//        - High IP Risk: alternatives (basis "alternatives"). The search uses the product's brand-free words
//          (a brand search on AliExpress mostly finds counterfeits), and a listing needs only half of them
//          (ALTERNATIVE_MATCH_MIN), compared as word stems so British and American spellings agree. Two guards
//          keep "similar" from meaning "unrelated": spare parts and accessories don't count (unless the
//          product is one), and nor does anything dearer than the brand's own price before VAT, which is a
//          different class of product (e.g. a commercial machine) rather than an alternative to resell.
//   4. The 0.7 confidence gate over all of that evidence (engine/confidence.ts).
//   5. calculateUKMargin: UK VAT, the £135 low-value import rule and the TikTok Shop UK fee stack, each
//      line citing its source. Whatever can't be sourced (shipping, returns, ad cost) is named, not guessed.
//
// It replaces v1's US Census wholesale estimate (CLAUDE.md Rule 6). Nothing withheld is estimated.

import { cleanTitle, sourcingKeywords } from "@/components/dashboard/dossier";
import { resaleRisk } from "@/components/dashboard/resellability";
import { checkResellability } from "@/engine/compliance";
import { calculateConfidence, FINANCIAL_THRESHOLD } from "@/engine/confidence";
import { calculateUKMargin } from "@/engine/margin";
import { POLICY_EVIDENCE, UK_VAT_STANDARD } from "@/engine/policy";
import { QueryBudget } from "@/server/live/budget";
import { median } from "@/server/live/margin";
import { searchTermFor, similarityScore, SUPPLIER_MATCH_MIN, supplierMatchScore } from "@/server/live/match";
import type { SupplierOffer } from "@/server/live/types";
import type { ProductDto } from "@/server/products/service";
import { currentOffers } from "@/server/scoring/engine";
import type { SupplierSource } from "@/server/sources/types";
import type { Evidence, EvidenceSourceType, Gated, ResellabilityFlags } from "@/types/dossier";
import type { CostInput, LandedMargin } from "@/types/financials";

/** High IP Risk only: a similar, unbranded alternative needs at least half of the product's brand-free key words. */
export const ALTERNATIVE_MATCH_MIN = 0.5;
/** Spare parts and accessories of a product aren't alternatives to it. */
const PART_WORDS = /\b(replacement|spares?|parts?|accessor(y|ies)|attachments?|compatible|refills?)\b/i;
const CORROBORATED = 4; // UK store prices that clear the numbers gate on their own (engine/confidence.ts)
export const SUPPLIER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type CatalogProduct = Pick<ProductDto, "name" | "brand" | "category" | "description" | "offers">;

/** What the resale checks read. Its own type (not ProductDto's), because the product DTO is built with it. */
export type ResaleText = { name: string; brand: string | null; category: string; description: string | null; offers: { sourceEvidenceId: string }[] };

export type CatalogMargin = {
  checkedAt: string;
  resellability: ResellabilityFlags;
  margin: Gated<LandedMargin>;
  /**
   * What the supplier side is: "exact" matches of the product, or (High IP Risk) "alternatives", similar
   * unbranded products, which the dossier labels as such under a warning.
   */
  basis: "exact" | "alternatives";
  /**
   * The UK selling price on its own, for the dossier's calculator: the median of the stores' current GBP
   * prices and how strongly they agree. The calculator fills it in only from FINANCIAL_THRESHOLD (0.7).
   */
  retail: { price: number | null; confidence: number; stores: number };
  /** The UK store prices the retail price is the median of. */
  retailOffers: { merchant: string; url: string; price: number; observedAt: string; evidenceId: string }[];
  /** The AliExpress offers the supplier cost is the median of, best match first. */
  supplierMatches: { title: string; url: string; unitPrice: number; matchScore: number; evidenceId: string }[];
  /** Every evidence item the result rests on, including the tax and fee rules its margin cites. */
  evidence: Evidence[];
};

/** What happened when the supplier source was asked; `null` means it wasn't (nothing to ask it for). */
export type SupplierResult = { status: "found"; offers: SupplierOffer[] } | { status: "not_connected" } | { status: "failed" };

// v1 source types → the v2 evidence types confidence is weighed by.
const SOURCE_TYPE: Record<string, EvidenceSourceType> = {
  RETAILER: "marketplace",
  MARKETPLACE: "marketplace",
  MANUFACTURER: "marketplace",
  REVIEW: "review",
};

type Offer = CatalogProduct["offers"][number];

/** Each store's current in-stock capture (newest within 30 days), in GBP, cheapest first. */
function currentUkOffers(offers: Offer[], now: Date): Offer[] {
  const facts = offers.map((o) => ({ ...o, price: Number(o.price.amount), currency: o.price.currency, observedAt: new Date(o.observedAt), offer: o }));
  return currentOffers(facts, now)
    .filter((f) => f.currency === "GBP")
    .sort((a, b) => a.price - b.price || a.sourceEvidenceId.localeCompare(b.sourceEvidenceId))
    .map((f) => f.offer);
}

const retailEvidence = (o: Offer): Evidence => ({
  id: o.sourceEvidenceId,
  provider: o.merchant,
  sourceType: SOURCE_TYPE[o.source.type] ?? "other",
  sourceUrl: o.url,
  observedAt: o.observedAt,
  publishedAt: null,
  quality: o.source.quality,
  claim: o.source.claim,
  value: Number(o.price.amount),
});

const supplierEvidence = (o: SupplierOffer, matchScore: number): Evidence => ({
  id: o.evidence.id,
  provider: o.evidence.provider,
  sourceType: "supplier",
  sourceUrl: o.evidence.sourceUrl,
  observedAt: o.evidence.observedAt,
  publishedAt: null,
  quality: o.evidence.quality,
  claim: o.evidence.claim,
  value: o.unitPrice.amount,
  matchScore,
});

/** A cost line from the median of cited prices: the evidence is every price the median came from. */
const medianInput = (items: { price: number; evidenceId: string }[]): CostInput => ({
  amount: Math.round(median(items.map((i) => i.price)) * 100) / 100,
  basis: "sourced",
  evidenceIds: items.map((i) => i.evidenceId),
});

const withheld = (reason: "Insufficient Data", confidence: number, missing: string[]): Gated<LandedMargin> => ({
  status: "withheld",
  reason,
  confidence,
  missing,
});

/** The product's resellability, from its own name, brand, category and description. Pure. */
export function catalogResellability(product: ResaleText): ResellabilityFlags {
  return checkResellability({
    title: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
    market: "UK",
    evidenceIds: [...new Set(product.offers.map((o) => o.sourceEvidenceId))],
  });
}

/**
 * What suppliers are searched for and matched against: the product's title without store tags or, for a
 * High IP Risk product, its generic, brand-free words, to find similar, unbranded alternatives.
 */
export function supplierQuery(product: CatalogProduct): { title: string; alternatives: boolean } {
  const merchant = product.offers[0]?.merchant ?? null;
  if (resaleRisk(catalogResellability(product)) === "ip") {
    return { title: sourcingKeywords({ name: product.name, brand: product.brand, category: product.category, merchant }), alternatives: true };
  }
  return { title: cleanTitle(product.name, merchant), alternatives: false };
}

/** What the supplier source is searched for: the query's key words. */
export function supplierSearchTerm(product: CatalogProduct): string {
  return searchTermFor(supplierQuery(product).title);
}

/** Any product with a current UK price is worth a supplier call, branded ones included (as alternatives). */
export function needsSupplier(product: CatalogProduct, now: Date): boolean {
  return currentUkOffers(product.offers, now).length > 0;
}

/** Builds the margin from the product and what the supplier source answered (null: not asked). Pure. */
export function buildCatalogMargin(product: CatalogProduct, supplier: SupplierResult | null, now: Date): CatalogMargin {
  const flags = catalogResellability(product);
  const query = supplierQuery(product);
  const uk = currentUkOffers(product.offers, now);
  const retail = uk.map(retailEvidence);
  const base = {
    checkedAt: now.toISOString(),
    resellability: flags,
    basis: query.alternatives ? ("alternatives" as const) : ("exact" as const),
    retail: {
      price: uk.length ? Math.round(median(uk.map((o) => Number(o.price.amount))) * 100) / 100 : null,
      confidence: calculateConfidence(retail, now),
      stores: uk.length,
    },
    retailOffers: uk.map((o) => ({ merchant: o.merchant, url: o.url, price: Number(o.price.amount), observedAt: o.observedAt, evidenceId: o.sourceEvidenceId })),
  };
  const result = (margin: Gated<LandedMargin>, matched: { offer: SupplierOffer; score: number }[] = []): CatalogMargin => {
    const supplierEv = matched.map((m) => supplierEvidence(m.offer, m.score));
    const used = new Set(margin.status === "shown" ? margin.evidenceIds : []);
    return {
      ...base,
      margin,
      supplierMatches: matched.map((m) => ({ title: m.offer.title, url: m.offer.url, unitPrice: m.offer.unitPrice.amount, matchScore: m.score, evidenceId: m.offer.evidence.id })),
      evidence: [...retail, ...supplierEv, ...POLICY_EVIDENCE.filter((e) => used.has(e.id))],
    };
  };

  // 1. The resale checks travel with the result (`resellability`, `basis`); they don't hold the margin back.
  // 2. A UK retail price, from the stores' own current prices.
  if (uk.length === 0) {
    const elsewhere = [...new Set(product.offers.map((o) => o.price.currency).filter((c) => c !== "GBP"))].sort();
    return result(
      withheld("Insufficient Data", 0, [
        elsewhere.length
          ? `a current UK store price in GBP (this product's prices are in ${elsewhere.join(", ")}; nothing is converted)`
          : "a current in-stock store price (none captured in the last 30 days)",
      ]),
    );
  }

  // 3. The supplier cost, from live AliExpress offers.
  const retailConfidence = calculateConfidence(retail, now);
  if (!supplier || supplier.status === "not_connected") {
    return result(withheld("Insufficient Data", retailConfidence, ["live AliExpress supplier prices (the AliExpress connection isn't set up here)"]));
  }
  if (supplier.status === "failed") {
    return result(
      withheld("Insufficient Data", retailConfidence, ["live AliExpress supplier prices: the supplier search failed just now, so nothing is estimated. Reload the page to try again."]),
    );
  }
  // Exact matches (80% of the key words), or for High IP Risk similar alternatives (half the brand-free words,
  // as stems), without spare parts and without anything dearer than the brand's own price before VAT.
  const round3 = (x: number) => Math.round(x * 1000) / 1000;
  const gbp = supplier.offers.filter((o) => o.unitPrice.currency === "GBP");
  const similar = query.alternatives
    ? gbp.map((offer) => ({ offer, score: round3(similarityScore(query.title, offer.title)) })).filter((m) => m.score >= ALTERNATIVE_MATCH_MIN)
    : gbp.map((offer) => ({ offer, score: round3(supplierMatchScore(query.title, offer.title)) })).filter((m) => m.score >= SUPPLIER_MATCH_MIN);
  const ceiling = base.retail.price! / (1 + UK_VAT_STANDARD.rate);
  const productIsPart = PART_WORDS.test(product.name);
  type Match = (typeof similar)[number];
  const isPart = (m: Match) => query.alternatives && !productIsPart && PART_WORDS.test(m.offer.title);
  const tooDear = (m: Match) => query.alternatives && m.offer.unitPrice.amount > ceiling;
  const parts = similar.filter(isPart).length;
  const dearer = similar.filter((m) => !isPart(m) && tooDear(m)).length;
  const matched = similar
    .filter((m) => !isPart(m) && !tooDear(m))
    .sort((a, b) => b.score - a.score || a.offer.unitPrice.amount - b.offer.unitPrice.amount);

  // 4. The numbers gate, over every source.
  const confidence = calculateConfidence([...retail, ...matched.map((m) => supplierEvidence(m.offer, m.score))], now);
  if (matched.length === 0) {
    return result(
      withheld("Insufficient Data", confidence, [
        !query.alternatives
          ? `No exact supplier match found: none of the ${supplier.offers.length} AliExpress listings carries at least 80% of this product's key words, so no margin is calculated.`
          : similar.length === 0
            ? `No similar, unbranded alternative found: none of the ${supplier.offers.length} AliExpress listings carries at least half of this product's brand-free key words, so no margin is calculated.`
            : `No comparable alternative found: of ${similar.length} similar AliExpress listings, ${dearer} cost more than this product sells for before VAT (a different class of product, not one to resell at its price)${parts ? ` and ${parts} ${parts === 1 ? "is a spare part or accessory" : "are spare parts or accessories"}` : ""}, so no margin is calculated.`,
      ]),
    );
  }
  if (confidence < FINANCIAL_THRESHOLD) {
    return result(
      withheld("Insufficient Data", confidence, [
        ...(uk.length < CORROBORATED ? [`more current UK store prices (${uk.length} found)`] : []),
        ...(matched.length < 3 ? [`more or closer supplier matches (${matched.length} found)`] : []),
        ...(uk.length >= CORROBORATED && matched.length >= 3 ? ["fresher evidence"] : []),
      ]),
      matched,
    );
  }

  // 5. The landed margin.
  const margin = calculateUKMargin({
    retailPrice: medianInput(retail.map((e) => ({ price: e.value as number, evidenceId: e.id }))),
    supplierCost: medianInput(matched.map((m) => ({ price: m.offer.unitPrice.amount, evidenceId: m.offer.evidence.id }))),
    shipping: null, // the supplier search doesn't quote shipping
    returns: null,
    adCostPerSale: null,
  });
  return result({ status: "shown", confidence, value: margin, evidenceIds: margin.evidenceIds }, matched);
}

// ── Fetching (the only I/O) ──────────────────────────────────────────────────

export interface SupplierCache {
  get(term: string, now: Date): SupplierOffer[] | null;
  put(term: string, offers: SupplierOffer[], now: Date): void;
}

/** Supplier results in this process's memory for `ttlMs`, the oldest dropped past `max` search terms. */
export function memorySupplierCache(ttlMs = SUPPLIER_CACHE_TTL_MS, max = 500): SupplierCache {
  const rows = new Map<string, { at: number; offers: SupplierOffer[] }>();
  return {
    get(term, now) {
      const row = rows.get(term);
      return row && now.getTime() - row.at < ttlMs ? row.offers : null;
    },
    put(term, offers, now) {
      rows.delete(term);
      rows.set(term, { at: now.getTime(), offers });
      if (rows.size > max) rows.delete(rows.keys().next().value!);
    },
  };
}

const sharedCache = memorySupplierCache();

export type CatalogMarginDeps = {
  /** The live supplier source; null when it isn't configured. */
  supplier: SupplierSource | null;
  cache?: SupplierCache;
  /** The clock, read again after fetching so evidence just read isn't later than the result. */
  now?: () => Date;
  budget?: () => QueryBudget;
};

/** The product's UK landed margin. Calls the supplier source at most once, and only when it's needed. */
export async function getCatalogMargin(product: CatalogProduct, deps: CatalogMarginDeps): Promise<CatalogMargin> {
  const now = deps.now ?? (() => new Date());
  if (!needsSupplier(product, now())) return buildCatalogMargin(product, null, now());
  if (!deps.supplier) return buildCatalogMargin(product, { status: "not_connected" }, now());

  const cache = deps.cache ?? sharedCache;
  const term = supplierSearchTerm(product);
  let offers = cache.get(term, now());
  if (!offers) {
    try {
      const budget = deps.budget?.() ?? new QueryBudget({ maxCalls: 1, deadlineMs: 8_000 });
      offers = await deps.supplier.search(term, "GB", budget);
      cache.put(term, offers, now());
    } catch (e) {
      console.error("[catalog-margin] supplier search failed", e);
      return buildCatalogMargin(product, { status: "failed" }, now());
    }
  }
  return buildCatalogMargin(product, { status: "found", offers }, now());
}
