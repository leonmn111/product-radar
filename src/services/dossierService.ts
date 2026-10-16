// Dossier assembly (ARCHITECTURE.md › The product): raw source data in, the 8-part Dossier out.
//
//   fetchDossierData()         the only parts that call providers. A search: Amazon UK listings for
//   fetchProductDossierData()  the query (Rainforest), then supplier offers (AliExpress) for the
//                              best-corroborated product. One product: its Amazon UK page, other
//                              listings of it, then supplier offers.
//   buildDossier()             pure: compliance → confidence → the two gates → margins → the Dossier.
//   getProductDossier()        one product's Dossier from the 48-hour cache (no provider calls) or,
//                              when there's no fresh copy, fetched, built and cached. Payment is the
//                              caller's: a cached Dossier costs the buyer the same as a new one.
//
// When the first search finds too few listings of the product, the synonyms of the search term are
// searched too (engine/synonyms.ts), as far as the query's call budget allows.
//
// Gates (CLAUDE.md Rule 5): below 0.5 the Verdict is withheld; below 0.7 the margin, momentum and
// saturation are withheld as "Insufficient Data". A product that isn't sellable gets its failure
// reasons in Resellability and no financial calculation at all. Nothing withheld is estimated.

import { checkResellability, isSellable } from "@/engine/compliance";
import { calculateConfidence, FINANCIAL_THRESHOLD, VERDICT_THRESHOLD } from "@/engine/confidence";
import type { ImageMatcher } from "@/engine/imageMatch";
import { calculateEUMargin, calculateUKMargin } from "@/engine/margin";
import { POLICY_EVIDENCE } from "@/engine/policy";
import { expandQuery } from "@/engine/synonyms";
import { QueryBudget } from "@/server/live/budget";
import { median } from "@/server/live/margin";
import { searchTermFor, titleSimilarity } from "@/server/live/match";
import { groupSameProduct } from "@/server/live/search";
import type { RetailListing, RetailProductDetail, SupplierOffer } from "@/server/live/types";
import type { RetailSource, SupplierSource } from "@/server/sources/types";
import type { DossierCacheStore } from "@/services/dossierCache";
import type { Dossier, Evidence, Gated, LandedMargins, Momentum, ResellabilityFlags, Saturation, SupplierMatch, SupplierMatches, Verdict } from "@/types/dossier";
import type { CostInput, FeeStack, ReturnsInput } from "@/types/financials";

const SUPPLIER_MATCH_MIN = 0.5; // a supplier title must match the product at least this well
const LAUNCH_MIN_MARGIN_PCT = 25; // net margin, % of the retail price
const LAUNCH_MIN_ROI_PCT = 50; // net profit ÷ landed cost
const CORROBORATED = 4; // listings of one product that clear the numbers gate on their own (engine/confidence.ts)

// ── Input ────────────────────────────────────────────────────────────────────

/** Everything the Dossier is built from: listings and offers, each carrying its own evidence. */
export type DossierInput = {
  query: string;
  /** Amazon UK listings for the query (Rainforest). */
  ukListings: RetailListing[];
  /** Supplier offers priced for delivery to the UK (AliExpress). */
  suppliers: SupplierOffer[];
  /** EU listings and supplier offers in EUR, and the channel's fees; without them there's no EU margin. */
  eu?: { country: string; listings: RetailListing[]; suppliers: SupplierOffer[]; feeStack: FeeStack } | null;
  /** Set when the Dossier is for one product (its Amazon ASIN) rather than the best match for a search. */
  productId?: string;
  /** The product page's brand, seller, category and text, when it was read: the resellability checks use them. */
  details?: Omit<RetailProductDetail, "listing"> | null;
  /** The caller's own figures; anything missing is excluded from the margin and named. */
  assumptions?: { feeStack?: FeeStack; returns?: ReturnsInput | null; adCostPerSale?: CostInput | null };
  sample?: boolean;
  notes?: string[];
};

// ── Fetching (the only I/O) ──────────────────────────────────────────────────

export type FetchOptions = { budget?: QueryBudget; maxExtraSearches?: number };

const failure = (e: unknown) => (e instanceof Error ? e.message : "unknown error");

/**
 * Listings for `terms[0]`, then for its synonyms while the product `sizeOf` measures has fewer than
 * CORROBORATED listings. The first search failing throws (there's nothing to build on); a synonym
 * search failing is kept as a note.
 */
async function searchWithSynonyms(
  terms: string[],
  retail: RetailSource,
  budget: QueryBudget,
  maxExtra: number,
  sizeOf: (listings: RetailListing[]) => number,
  seed: RetailListing[],
  notes: string[],
): Promise<RetailListing[]> {
  const byId = new Map(seed.map((l) => [l.id, l]));
  const add = (found: RetailListing[]) => found.forEach((l) => byId.has(l.id) || byId.set(l.id, l));
  add(await retail.search(terms[0], "GB", budget));
  const extra: string[] = [];
  for (const term of terms.slice(1, 1 + maxExtra)) {
    if (sizeOf([...byId.values()]) >= CORROBORATED) break;
    try {
      add(await retail.search(term, "GB", budget));
      extra.push(term);
    } catch (e) {
      notes.push(`The synonym search "${term}" failed (${failure(e)}), so it wasn't used.`);
      break;
    }
  }
  if (extra.length) notes.push(`Too few listings matched "${terms[0]}", so Amazon UK was also searched for ${extra.map((t) => `"${t}"`).join(", ")}.`);
  return [...byId.values()];
}

async function supplierOffers(title: string, supplier: SupplierSource, budget: QueryBudget, notes: string[]) {
  try {
    return await supplier.search(searchTermFor(title), "GB", budget);
  } catch (e) {
    notes.push(`Supplier search failed (${failure(e)}), so no supplier evidence was used.`);
    return [];
  }
}

/**
 * Searches Amazon UK for the query (and its synonyms when too few listings agree), picks the product
 * most listings agree on, and asks the supplier source for it. Default budget: 3 calls, which is the
 * search, one synonym search at most, and the supplier search.
 */
export async function fetchDossierData(
  query: string,
  sources: { retail: RetailSource; supplier: SupplierSource },
  { budget = new QueryBudget({ maxCalls: 3, deadlineMs: 30_000 }), maxExtraSearches = 1 }: FetchOptions = {},
): Promise<DossierInput> {
  const notes: string[] = [];
  const terms = expandQuery(query);
  const ukListings = await searchWithSynonyms(terms.length ? terms : [query], sources.retail, budget, maxExtraSearches, (ls) => groupSameProduct(ls)[0]?.length ?? 0, [], notes);
  const top = groupSameProduct(ukListings)[0];
  const suppliers = top ? await supplierOffers(top[0].title, sources.supplier, budget, notes) : [];
  return { query, ukListings, suppliers, notes };
}

/**
 * One product by its Amazon UK ASIN: the product page (price, brand, seller, category), other listings
 * of the same product (a search for its title, then synonyms while too few agree), then supplier offers.
 * Null when Amazon UK has no priced product with that ASIN. Default budget: 5 calls.
 */
export async function fetchProductDossierData(
  asin: string,
  sources: { retail: RetailSource; supplier: SupplierSource },
  { budget = new QueryBudget({ maxCalls: 5, deadlineMs: 45_000 }), maxExtraSearches = 2 }: FetchOptions = {},
): Promise<DossierInput | null> {
  const page = await sources.retail.product(asin, "GB", budget);
  if (!page) return null;
  const { listing, ...details } = page;
  const notes: string[] = [];
  const term = searchTermFor(listing.title);
  const sizeOf = (ls: RetailListing[]) => groupSameProduct(ls).find((g) => g.some((l) => l.id === listing.id))?.length ?? 0;
  let ukListings: RetailListing[] = [listing];
  try {
    // The page goes first so it seeds its own group; search results for the same ASIN are the same listing.
    ukListings = await searchWithSynonyms(expandQuery(term), sources.retail, budget, maxExtraSearches, sizeOf, [listing], notes);
  } catch (e) {
    notes.push(`The search for other listings of this product failed (${failure(e)}), so only its own page was used.`);
  }
  const suppliers = await supplierOffers(listing.title, sources.supplier, budget, notes);
  return { query: asin, productId: listing.id, details, ukListings, suppliers, notes };
}

// ── Pure assembly ────────────────────────────────────────────────────────────

const toEvidence = (e: RetailListing["evidence"], sourceType: Evidence["sourceType"], value: number, matchScore?: number): Evidence => ({
  id: e.id,
  provider: e.provider,
  sourceType,
  sourceUrl: e.sourceUrl,
  observedAt: e.observedAt,
  publishedAt: null,
  quality: e.quality,
  claim: e.claim,
  value,
  ...(matchScore === undefined ? {} : { matchScore }),
});

const withheld = <T>(reason: "Insufficient Data" | "Not Sellable", confidence: number, missing: string[]): Gated<T> => ({
  status: "withheld",
  reason,
  confidence,
  missing,
});

const tripped = (flags: ResellabilityFlags) =>
  (Object.entries(flags) as [keyof ResellabilityFlags, ResellabilityFlags[keyof ResellabilityFlags]][]).filter(([, f]) => f.value === true);

/** A cost line from medians of cited prices: the evidence is every listing the median came from. */
const medianInput = (items: { price: number; evidenceId: string }[]): CostInput => ({
  amount: Math.round(median(items.map((i) => i.price)) * 100) / 100,
  basis: "sourced",
  evidenceIds: items.map((i) => i.evidenceId),
});

function decideVerdict(args: {
  confidence: number;
  flags: ResellabilityFlags;
  supplierCount: number;
  margins: LandedMargins | null;
}): Verdict {
  const blocked = tripped(args.flags);
  if (blocked.length) return { kind: "AVOID", reasons: blocked.map(([name, f]) => `${name}: ${f.reason}`) };
  if (args.supplierCount === 0) return { kind: "AVOID", reasons: ["No supplier listing matches this product, so it can't be sourced."] };
  const uk = args.margins?.uk;
  if (!uk) {
    return { kind: "TEST", reasons: ["Sellable and matched to a supplier, but the evidence is too thin to show the numbers yet."] };
  }
  const profit = `£${uk.netProfit.amount.toFixed(2)} net per unit (${uk.netMarginPct}% of the price)`;
  if (uk.netProfit.amount <= 0) return { kind: "AVOID", reasons: [`Loses money: ${profit}.`] };
  if (uk.complete && uk.netMarginPct >= LAUNCH_MIN_MARGIN_PCT && uk.roiPercentage >= LAUNCH_MIN_ROI_PCT) {
    return { kind: "LAUNCH", reasons: [`${profit}, ${uk.roiPercentage}% return on landed cost, every cost accounted for.`] };
  }
  const gaps = uk.excluded.map((x) => x.label.toLowerCase());
  return {
    kind: "TEST",
    reasons: [
      `${profit}, ${uk.roiPercentage}% return on landed cost.`,
      ...(gaps.length ? [`Not yet counted: ${gaps.join(", ")}. Test with a small order before scaling.`] : []),
    ],
  };
}

/**
 * Builds the 8-part Dossier from source data. Pure, except for what `ctx.imageMatcher` does:
 * `ctx` supplies the id, the time and, optionally, how supplier images are compared with the product's.
 */
export function buildDossier(input: DossierInput, ctx: { id: string; now: Date; imageMatcher?: ImageMatcher }): Dossier {
  const notes = [...(input.notes ?? [])];
  const groups = groupSameProduct(input.ukListings);
  const group = (input.productId ? groups.find((g) => g.some((l) => l.id === input.productId)) : groups[0]) ?? [];
  if (group.length === 0) throw new Error(input.productId ? `buildDossier: no listing for ${input.productId}` : "buildDossier needs at least one listing");
  const lead = group.find((l) => l.id === input.productId) ?? group[0];

  // A simulated image score is made up, so it may only ever touch development sample data.
  const imageMatcher = ctx.imageMatcher;
  if (imageMatcher?.method === "simulated" && !input.sample) throw new Error("Simulated image matching is for development sample data only.");
  const imageScore = (offer: SupplierOffer) =>
    imageMatcher && lead.image && offer.image ? Math.round(imageMatcher.compare(lead.image, offer.image) * 1000) / 1000 : null;

  // Suppliers that match the product, best first, in one currency (nothing is converted here). Title
  // and image similarity are independent signals, so they combine as 1 − (1 − title)(1 − image).
  const matchIn = (offers: SupplierOffer[], currency: string) =>
    offers
      .filter((o) => o.unitPrice.currency === currency)
      .map((offer) => {
        const title = Math.round(titleSimilarity(lead.title, offer.title) * 1000) / 1000;
        const image = imageScore(offer);
        return { offer, title, image, score: image === null ? title : Math.round((1 - (1 - title) * (1 - image)) * 1000) / 1000 };
      })
      .filter((m) => m.score >= SUPPLIER_MATCH_MIN)
      .sort((a, b) => b.score - a.score);
  const matched = matchIn(input.suppliers, "GBP");
  const skippedCurrency = input.suppliers.filter((o) => o.unitPrice.currency !== "GBP").length;
  if (skippedCurrency) notes.push(`${skippedCurrency} supplier offer(s) weren't priced in GBP and were left out (nothing is converted here).`);

  const retailEvidence = group.map((l) => toEvidence(l.evidence, "marketplace", l.price.amount));
  if (imageMatcher?.method === "simulated" && matched.some((m) => m.image !== null)) {
    notes.push("Supplier image similarity is SIMULATED (a random 0.6–0.99): development only, never on real data.");
  }
  const supplierEvidence = matched.map((m) => ({
    ...toEvidence(m.offer.evidence, "supplier", m.offer.unitPrice.amount, m.title),
    ...(m.image === null || !imageMatcher ? {} : { imageMatch: { score: m.image, method: imageMatcher.method, comparedWith: lead.evidence.id } }),
  }));

  // 1. Compliance first: a product that can't be resold gets no financial calculation.
  const d = input.details;
  const flags = checkResellability({
    title: lead.title,
    brand: d?.brand ?? null,
    sellerName: d?.sellerName ?? null,
    category: d?.category ?? null,
    description: d?.description ?? null,
    bulletPoints: d?.bulletPoints ?? null,
    market: "UK",
    evidenceIds: d ? [lead.evidence.id] : group.map((l) => l.evidence.id),
  });
  const sellable = isSellable(flags);

  // 2. Confidence over every source, supplier evidence weighed by how well it matches.
  const confidence = calculateConfidence([...retailEvidence, ...supplierEvidence], ctx.now);
  const evidenceGap = [
    ...(group.length < 4 ? [`more independent Amazon UK listings of this product (${group.length} found agree on it)`] : []),
    ...(matched.length === 0 ? ["a supplier listing that matches this product"] : matched.length < 3 ? [`more or closer supplier matches (${matched.length} found)`] : []),
  ];

  // 3. The financial gate, then the margins.
  let landedMargin: Gated<LandedMargins>;
  let margins: LandedMargins | null = null;
  if (!sellable) {
    landedMargin = withheld("Not Sellable", confidence, tripped(flags).map(([name]) => `${name} is tripped`));
  } else if (confidence < FINANCIAL_THRESHOLD || matched.length === 0) {
    landedMargin = withheld("Insufficient Data", confidence, evidenceGap.length ? evidenceGap : ["more evidence"]);
  } else {
    const uk = calculateUKMargin({
      retailPrice: medianInput(group.map((l) => ({ price: l.price.amount, evidenceId: l.evidence.id }))),
      supplierCost: medianInput(matched.map((m) => ({ price: m.offer.unitPrice.amount, evidenceId: m.offer.evidence.id }))),
      shipping: null, // the supplier source doesn't quote shipping yet
      returns: input.assumptions?.returns ?? null,
      adCostPerSale: input.assumptions?.adCostPerSale ?? null,
      feeStack: input.assumptions?.feeStack,
    });
    const euListings = input.eu?.listings.filter((l) => l.price.currency === "EUR") ?? [];
    const euMatched = input.eu ? matchIn(input.eu.suppliers, "EUR") : [];
    const eu =
      input.eu && euListings.length && euMatched.length
        ? calculateEUMargin({
            country: input.eu.country,
            feeStack: input.eu.feeStack,
            retailPrice: medianInput(euListings.map((l) => ({ price: l.price.amount, evidenceId: l.evidence.id }))),
            supplierCost: medianInput(euMatched.map((m) => ({ price: m.offer.unitPrice.amount, evidenceId: m.offer.evidence.id }))),
            shipping: null,
            returns: input.assumptions?.returns ?? null,
            adCostPerSale: input.assumptions?.adCostPerSale ?? null,
          })
        : null;
    if (!eu) notes.push("No EU margin: it needs EU listings and EUR supplier prices for the destination country.");
    margins = { uk, eu };
    landedMargin = { status: "shown", confidence, value: margins, evidenceIds: [...new Set([...uk.evidenceIds, ...(eu?.evidenceIds ?? [])])] };
  }

  // 4. Saturation and momentum share the financial gate.
  const saturation: Gated<Saturation> =
    confidence < FINANCIAL_THRESHOLD
      ? withheld("Insufficient Data", confidence, evidenceGap.length ? evidenceGap : ["more evidence"])
      : {
          status: "shown",
          confidence,
          value: { sellerCount: group.length, storeCount: new Set(group.map((l) => new URL(l.url).hostname)).size, adDensity: null },
          evidenceIds: group.map((l) => l.evidence.id),
        };
  // No trend history, velocity or ad data is collected yet, so momentum can't be shown at any confidence.
  const momentum: Gated<Momentum> = withheld("Insufficient Data", confidence, [
    "12 weeks of daily trend history (the daily snapshot job)",
    "sales velocity (Keepa, Phase 1)",
    "ad duration (Meta Ad Library, Phase 2)",
  ]);

  // 5. The verdict gate.
  const verdict: Gated<Verdict> =
    confidence < VERDICT_THRESHOLD
      ? withheld("Insufficient Data", confidence, evidenceGap.length ? evidenceGap : ["more evidence"])
      : {
          status: "shown",
          confidence,
          value: decideVerdict({ confidence, flags, supplierCount: matched.length, margins }),
          evidenceIds: [...retailEvidence, ...supplierEvidence].map((e) => e.id),
        };

  const supplierMatches = matched.slice(0, 3).map(
    ({ offer, score }): SupplierMatch => ({
      platform: "aliexpress",
      listingUrl: offer.url,
      title: offer.title,
      unitPrice: { amount: offer.unitPrice.amount, currency: "GBP" },
      moq: null, // the affiliate API doesn't state one
      deliveryDays: null, // not quoted by the source yet
      matchScore: score,
      evidenceIds: [offer.evidence.id],
    }),
  ) as SupplierMatches;

  // Every evidence item the Dossier rests on, including the tax and fee rules its margins cite.
  const used = new Set(landedMargin.status === "shown" ? landedMargin.evidenceIds : []);
  const evidence = [...retailEvidence, ...supplierEvidence, ...POLICY_EVIDENCE.filter((e) => used.has(e.id))];

  return {
    id: ctx.id,
    generatedAt: ctx.now.toISOString(),
    product: {
      title: lead.title,
      query: input.query,
      market: "UK",
      country: "GB",
      currency: "GBP",
      identifiers: { asin: lead.id, supplierIds: matched.map((m) => m.offer.id) },
    },
    sample: input.sample ?? false,
    notes,
    verdict,
    resellability: flags,
    landedMargin,
    momentum,
    saturation,
    supplierMatches,
    evidence,
    exports: { shopifyCsvUrl: null, pdfUrl: null, shareLink: null },
  };
}

// ── Cached product Dossiers ──────────────────────────────────────────────────

export type ProductDossierDeps = {
  sources: { retail: RetailSource; supplier: SupplierSource };
  cache: DossierCacheStore;
  /** Development sample data: only ever served from, and to, sample mode. */
  sample: boolean;
  /** Notes added to a newly built Dossier (e.g. that the suppliers are sample data). */
  notes?: string[];
  imageMatcher?: ImageMatcher;
  /** This copy's id (the paid request's identifier). */
  id: string;
  /**
   * The clock. Read again after fetching, so evidence the providers just read isn't "from the
   * future" (later than the time the Dossier is built at, which would make it count for nothing).
   */
  now?: () => Date;
  budget?: QueryBudget;
};

/**
 * One product's Standard Dossier: the cached one while it's under 48 hours old (no provider is
 * called; the copy gets this request's id and says it came from the cache), otherwise fetched,
 * built and cached. Null when Amazon UK has no priced product with that ASIN. Failing to write
 * the cache doesn't fail the request.
 */
export async function getProductDossier(asin: string, deps: ProductDossierDeps): Promise<{ dossier: Dossier; cache: "hit" | "miss" } | null> {
  const clock = deps.now ?? (() => new Date());
  const cached = await deps.cache.get(asin, clock());
  if (cached && cached.sample === deps.sample) {
    const note = `From the 48-hour cache: built ${cached.generatedAt}; no data provider was called for this copy.`;
    return { cache: "hit", dossier: { ...cached, id: deps.id, notes: [...cached.notes, note] } };
  }
  const data = await fetchProductDossierData(asin, deps.sources, deps.budget ? { budget: deps.budget } : {});
  if (!data) return null;
  const dossier = buildDossier(
    { ...data, sample: deps.sample, notes: [...(data.notes ?? []), ...(deps.notes ?? [])] },
    { id: deps.id, now: clock(), imageMatcher: deps.imageMatcher },
  );
  try {
    await deps.cache.put(dossier, clock());
  } catch (e) {
    console.error("[dossier] couldn't cache", asin, e);
  }
  return { dossier, cache: "miss" };
}
