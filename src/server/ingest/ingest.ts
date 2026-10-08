// URL → live Product, Evidence and Offer records → recalculated scores.
//
// Evidence-First: every stored fact is an Evidence row pointing at the page it
// came from, stamped with the fetch time, and given a quality score from a
// fixed table (below) based on how the fact was published. Nothing is guessed:
// a missing price means no Offer; a missing rating means no QUALITY score.

import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { EvidenceInput } from "@/lib/validation/evidence";
import { recalculateCategoryScores } from "@/server/scoring/service";
import { extractProduct, type ExtractedProduct, type ExtractionMethod } from "./extract";
import { fetchPage as defaultFetchPage, type FetchedPage } from "./fetch-page";

// Evidence quality by how the page published the fact (0–100). Structured data
// the store maintains for search engines is the most reliable; a bare <title>
// the least. Ratings/review counts hosted by the seller are capped lower than
// the seller's own price because the seller controls which reviews appear.
const METHOD_QUALITY: Record<ExtractionMethod, number> = {
  "json-ld": 80,
  microdata: 70,
  "open-graph": 65,
  html: 40,
};
const SELLER_HOSTED_REVIEW_CAP = 60;
const DEFAULT_CATEGORY = "uncategorized";
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_)/i;

export class IngestError extends Error {
  constructor(
    message: string,
    readonly code: "not_a_product_page",
  ) {
    super(message);
  }
}

export type IngestInput = { url: string; category?: string };
export type IngestDeps = { fetchPage?: (url: string) => Promise<FetchedPage> };

export function slugify(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productKeyUrl(extracted: ExtractedProduct, finalUrl: string) {
  const u = new URL(extracted.canonicalUrl ?? finalUrl);
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  u.hash = "";
  return u.toString();
}

function categoryFromExtracted(extracted: ExtractedProduct) {
  // "Apparel & Accessories > Shoes > Running" → "running"
  const raw = extracted.category?.value.split(/[>/|]/).pop()?.trim();
  const slug = raw ? slugify(raw).slice(0, 48).replace(/-+$/, "") : "";
  return slug || null;
}

const AVAILABILITY_TEXT = {
  IN_STOCK: "in stock",
  OUT_OF_STOCK: "out of stock",
  PREORDER: "pre-order",
  DISCONTINUED: "discontinued",
  UNKNOWN: "availability not stated",
} as const;

export async function ingestUrl(db: PrismaClient, input: IngestInput, deps: IngestDeps = {}) {
  const page = await (deps.fetchPage ?? defaultFetchPage)(input.url);
  const extracted = extractProduct(page.html, page.finalUrl);

  // Only pages that explicitly declare a product are ingested — homepages,
  // search results and bot-check pages ("Are you a robot?") are rejected.
  if (!extracted.title || !extracted.declaresProduct) {
    throw new IngestError(
      "Couldn't find product data on that page. Use the product's own page — not a homepage, search or category page. Some large stores (e.g. Amazon) block automated readers and show a bot-check page instead.",
      "not_a_product_page",
    );
  }

  const productUrl = productKeyUrl(extracted, page.finalUrl);
  const host = new URL(productUrl).hostname.replace(/^www\./, "");
  const observedAt = page.fetchedAt;
  const title = extracted.title.value.slice(0, 300);
  const warnings: string[] = [];

  const existing = await db.product.findUnique({ where: { url: productUrl }, select: { id: true, category: true } });
  const category = input.category ?? existing?.category ?? categoryFromExtracted(extracted) ?? DEFAULT_CATEGORY;
  const slug = `${slugify(title).slice(0, 60).replace(/-+$/, "") || "product"}-${createHash("sha1").update(productUrl).digest("hex").slice(0, 8)}`;

  if (!extracted.price) warnings.push("No machine-readable price with a currency was found, so no offer was recorded.");
  if (!extracted.rating) warnings.push("No rating data was published on the page, so Quality and Value can't be scored yet.");

  const evidence = (data: Omit<EvidenceInput, "productId" | "sourceUrl" | "sourceName" | "sourceType" | "observedAt">) =>
    (productId: string) =>
      EvidenceInput.parse({ ...data, productId, sourceUrl: productUrl, sourceName: host, sourceType: "RETAILER", observedAt });

  const result = await db.$transaction(async (tx) => {
    const product = await tx.product.upsert({
      where: { url: productUrl },
      create: {
        url: productUrl,
        slug,
        name: title,
        category,
        brand: extracted.brand?.value.slice(0, 120) ?? null,
        description: extracted.description?.value.slice(0, 2000) ?? null,
        imageUrl: extracted.imageUrl?.value ?? null,
      },
      update: {
        name: title,
        category,
        brand: extracted.brand?.value.slice(0, 120) ?? undefined,
        description: extracted.description?.value.slice(0, 2000) ?? undefined,
        imageUrl: extracted.imageUrl?.value ?? undefined,
      },
    });

    const created: string[] = [];
    const add = async (make: (productId: string) => EvidenceInput) => {
      const row = await tx.evidence.create({ data: make(product.id) });
      created.push(row.id);
      return row;
    };

    await add(
      evidence({
        claim: `Product listing: "${title}"`,
        excerpt: extracted.description?.value.slice(0, 500),
        qualityScore: METHOD_QUALITY[extracted.title!.method],
      }),
    );

    let offer = null;
    if (extracted.price) {
      const { amount, currency, availability } = extracted.price.value;
      const priceEvidence = await add(
        evidence({
          claim: `Listed at ${amount} ${currency} (${AVAILABILITY_TEXT[availability]})`,
          qualityScore: METHOD_QUALITY[extracted.price.method],
        }),
      );
      offer = await tx.offer.create({
        data: {
          productId: product.id,
          sourceEvidenceId: priceEvidence.id,
          merchant: host,
          url: productUrl,
          price: amount,
          currency,
          availability,
          observedAt,
        },
      });
    }

    if (extracted.rating) {
      const { value, best } = extracted.rating.value;
      const outOfFive = Math.round((value / best) * 5 * 100) / 100;
      await add(
        evidence({
          claim: `Average rating ${value} / ${best} on ${host}`,
          qualityScore: Math.min(METHOD_QUALITY[extracted.rating.method], SELLER_HOSTED_REVIEW_CAP),
          metric: "RATING",
          metricValue: outOfFive,
        }),
      );
    }

    if (extracted.reviewCount) {
      await add(
        evidence({
          claim: `${extracted.reviewCount.value.toLocaleString("en-US")} ratings on ${host}`,
          qualityScore: Math.min(METHOD_QUALITY[extracted.reviewCount.method], SELLER_HOSTED_REVIEW_CAP),
          metric: "REVIEW_COUNT",
          metricValue: extracted.reviewCount.value,
        }),
      );
    }

    return { product, offer, evidenceIds: created };
  });

  // VALUE compares prices within a category, so rescore the whole category (and
  // the old one if the product moved).
  const scored = await recalculateCategoryScores(db, category, observedAt);
  if (existing && existing.category !== category) await recalculateCategoryScores(db, existing.category, observedAt);
  const scores = scored.find((s) => s.productId === result.product.id)?.scores ?? [];

  return {
    status: existing ? ("updated" as const) : ("created" as const),
    product: { id: result.product.id, slug: result.product.slug, name: result.product.name, category, url: productUrl },
    extracted: {
      title,
      brand: extracted.brand?.value ?? null,
      price: extracted.price?.value ?? null,
      rating: extracted.rating?.value ?? null,
      reviewCount: extracted.reviewCount?.value ?? null,
      methods: Object.fromEntries(
        (["title", "price", "rating", "reviewCount"] as const)
          .filter((k) => extracted[k])
          .map((k) => [k, extracted[k]!.method]),
      ),
    },
    evidenceCreated: result.evidenceIds.length,
    offerCreated: result.offer !== null,
    scores: scores.map((s) => ({ dimension: s.dimension, value: s.value, confidence: s.confidence })),
    warnings,
  };
}

export type IngestResult = Awaited<ReturnType<typeof ingestUrl>>;
