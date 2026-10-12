// Pure helpers behind the Opportunity Dossier: a rule-based verdict, profit
// maths, supplier-search keywords and a Shopify import CSV. No I/O, no LLM —
// every sentence in the verdict is built from the product's own scores and
// evidence (CLAUDE.md Rule 3), and everything is presented as an estimate (Rule 4).

import type { ProductDto } from "@/server/products/service";
import { humanizeSlug, type Evidence } from "./format";

// ── Verdict ──────────────────────────────────────────────────────────────────
//
// Scores are shrunk toward a neutral 50 when evidence is thin, so in practice
// they cluster between ~40 and ~75; thresholds are set for that range.

export type VerdictKind = "HIGH_POTENTIAL" | "MODERATE_RISK" | "CROWDED_MARKET";

export const VERDICT_LABEL: Record<VerdictKind, string> = {
  HIGH_POTENTIAL: "High Potential",
  MODERATE_RISK: "Moderate Risk",
  CROWDED_MARKET: "Crowded Market",
};

export const VERDICT_RULES = {
  minConfidence: 0.3, // below this, never more than "Moderate Risk"
  high: { overall: 62, quality: 65, minTrend: 45, minDemand: 45 },
  crowded: { demand: 60, maxValue: 55 },
  weak: { quality: 60, demand: 50, trend: 42 },
  rising: 58,
} as const;

export type Verdict = {
  kind: VerdictKind;
  label: string;
  sentences: [string, string];
  confidence: number;
  evidenceCount: number; // evidence items behind the OVERALL score (not distinct pages)
};

type Facts = { rating?: { value: number; sources: number }; reviews?: number; searchInterest?: number };

/** Latest capture per source URL for a metric (same rule as the scoring engine). */
function latestPerSource(evidence: Evidence[], type: NonNullable<Evidence["metric"]>["type"]) {
  const latest = new Map<string, Evidence>();
  for (const e of evidence) {
    if (e.metric?.type !== type) continue;
    const cur = latest.get(e.source.url);
    if (!cur || e.observedAt > cur.observedAt) latest.set(e.source.url, e);
  }
  return [...latest.values()].map((e) => e.metric!.value);
}

export function evidenceFacts(evidence: Evidence[]): Facts {
  const facts: Facts = {};
  const ratings = latestPerSource(evidence, "RATING");
  if (ratings.length) {
    facts.rating = { value: ratings.reduce((s, r) => s + r, 0) / ratings.length, sources: ratings.length };
  }
  const reviews = latestPerSource(evidence, "REVIEW_COUNT");
  if (reviews.length) facts.reviews = Math.max(...reviews);
  const search = evidence
    .filter((e) => e.metric?.type === "SEARCH_INTEREST")
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  if (search.length) facts.searchInterest = search[0].metric!.value;
  return facts;
}

const roundReviews = (n: number) =>
  n >= 1000 ? `about ${(Math.round(n / 100) * 100).toLocaleString("en-GB")}` : Math.round(n).toLocaleString("en-GB");

function factsSentence(f: Facts, trend: number | undefined): string {
  const parts: string[] = [];
  if (f.rating) {
    parts.push(
      `buyers rate it ${f.rating.value.toFixed(1)}/5 (${f.rating.sources} source${f.rating.sources === 1 ? "" : "s"})`,
    );
  }
  if (f.reviews !== undefined) parts.push(`it has ${roundReviews(f.reviews)} reviews`);
  if (f.searchInterest !== undefined) {
    const dir =
      trend === undefined
        ? ""
        : trend >= VERDICT_RULES.rising
          ? " and rising"
          : trend <= VERDICT_RULES.weak.trend
            ? " and falling"
            : " and steady";
    parts.push(`search interest is ${Math.round(f.searchInterest)}/100${dir}`);
  }
  if (parts.length === 0) return "We don't have rating, review or search data for this product yet.";
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

export function opportunityVerdict(p: ProductDto): Verdict | null {
  const overall = p.scores.OVERALL;
  if (!overall) return null;
  const v = (d: string) => p.scores[d]?.value;
  const quality = v("QUALITY");
  const demand = v("DEMAND");
  const value = v("VALUE");
  const trend = v("TREND");
  const R = VERDICT_RULES;

  let kind: VerdictKind;
  let why: string;
  if (overall.confidence < R.minConfidence) {
    kind = "MODERATE_RISK";
    why = `We only have limited evidence so far (${Math.round(overall.confidence * 100)}% confidence), so treat this as an early read rather than a green light.`;
  } else if (demand !== undefined && demand >= R.crowded.demand && value !== undefined && value < R.crowded.maxValue) {
    kind = "CROWDED_MARKET";
    why = "Demand is clearly proven, but it's priced above similar products we track, so a new seller would be competing for buyers who already have strong options.";
  } else if (
    overall.value >= R.high.overall &&
    quality !== undefined &&
    quality >= R.high.quality &&
    (trend === undefined || trend >= R.high.minTrend) &&
    (demand === undefined || demand >= R.high.minDemand)
  ) {
    kind = "HIGH_POTENTIAL";
    why =
      value !== undefined && value >= 60
        ? "Strong ratings plus good value against similar products make it one of the better opportunities we track and worth testing."
        : "Strong ratings and healthy demand make it one of the better opportunities we track and worth testing.";
  } else {
    kind = "MODERATE_RISK";
    const risks: string[] = [];
    if (trend !== undefined && trend <= R.weak.trend) risks.push("search interest is falling");
    if (quality !== undefined && quality < R.weak.quality) risks.push("ratings are only middling");
    if (demand !== undefined && demand < R.weak.demand) risks.push("demand signals are weak");
    why = risks.length
      ? `The main risks: ${risks.length === 1 ? risks[0] : `${risks.slice(0, -1).join(", ")} and ${risks.at(-1)}`}.`
      : `Its overall score of ${Math.round(overall.value)}/100 shows no major red flags, but nothing that clearly stands out either.`;
  }

  return {
    kind,
    label: VERDICT_LABEL[kind],
    sentences: [factsSentence(evidenceFacts(p.evidence), trend), why],
    confidence: overall.confidence,
    evidenceCount: overall.evidenceIds.length,
  };
}

// ── Profit ───────────────────────────────────────────────────────────────────

export const DEFAULT_WHOLESALE_SHARE = 0.3;

const cents = (x: number) => Math.round(x * 100) / 100;

export function defaultWholesale(price: number) {
  return cents(price * DEFAULT_WHOLESALE_SHARE);
}

export function estimateProfit(price: number, wholesale: number, adShipping: number) {
  const net = cents(price - wholesale - adShipping);
  return { net, marginPct: price > 0 ? Math.round((net / price) * 1000) / 10 : null };
}

/** Parses a money input; blank or invalid → null. */
export function parseMoney(s: string): number | null {
  const t = s.replace(/[£$€,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ── Titles & supplier keywords ───────────────────────────────────────────────

// A title segment that is just a store name or domain ("Amazon.co.uk",
// "Visit the Anker Store") rather than describing the product.
const STORE_SEGMENT =
  /^(?:visit the .+ store|.*\b(?:amazon|ebay|walmart|etsy|argos|currys|best ?buy|aliexpress|alibaba|temu|john lewis|shopify)\b.*|[\w-]+(?:\.[\w-]+)*\.(?:com|co\.uk|uk|co|de|fr|net|shop|store|io))$/i;

const letterBoundary = (phrase: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu");

/** The product title without store names and site tags, e.g. "X : Amazon.co.uk: Electronics" → "X". */
export function cleanTitle(name: string, merchant?: string | null): string {
  const merchantKey = merchant?.trim().toLowerCase();
  const segments = name
    .split(/\s+[|–—-]\s+|\s*:\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !STORE_SEGMENT.test(s) && s.toLowerCase() !== merchantKey);
  if (segments.length === 0) return name.trim();
  // The product name is the longest descriptive segment; the rest are categories/tags.
  return segments.reduce((a, b) => (b.length > a.length ? b : a));
}

const MAX_KEYWORDS = 8;

/** Generic search words for supplier sites: no brand, store tags, brackets or feature lists. */
export function sourcingKeywords(p: Pick<ProductDto, "name" | "brand" | "category"> & { merchant?: string | null }) {
  let t = cleanTitle(p.name, p.merchant)
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, " ")
    .replace(/[™®©]/g, "");
  // Long marketplace titles list features after the first comma — keep the product part.
  const head = t.split(/,|\s+with\s+/i)[0];
  if (head.trim().split(/\s+/).length >= 2) t = head;

  const brand = p.brand?.replace(/\(sample\)/i, "").trim();
  for (const phrase of [brand, p.merchant].filter((x): x is string => Boolean(x))) {
    t = t.replace(letterBoundary(phrase), " ");
    for (const word of phrase.split(/\s+/)) if (word.length > 1) t = t.replace(letterBoundary(word), " ");
  }

  let words = t
    .replace(/[^\p{L}\p{N}\s&'+./-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[-.'/+&]+|[-.'/+&]+$/g, ""))
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);

  // Too few words to search well (e.g. "Buds Lite") — add the category.
  if (words.length < 3) {
    const have = new Set(words.map((w) => w.toLowerCase()));
    words = [...words, ...humanizeSlug(p.category).toLowerCase().split(" ").filter((w) => !have.has(w))];
  }
  return words.join(" ");
}

export function supplierSearchUrls(keywords: string) {
  const q = encodeURIComponent(keywords).replace(/%20/g, "+");
  return {
    aliexpress: `https://www.aliexpress.com/wholesale?SearchText=${q}`,
    alibaba: `https://www.alibaba.com/trade/search?SearchText=${q}`,
  };
}

// ── Shopify CSV ──────────────────────────────────────────────────────────────

// Shopify's current product import headers (help.shopify.com › Using CSV files).
const SHOPIFY_COLUMNS = [
  "Title",
  "URL handle",
  "Description",
  "Vendor",
  "Type",
  "Tags",
  "Published on online store",
  "Status",
  "Price",
  "Cost per item",
  "Requires shipping",
] as const;

function csvCell(v: string) {
  // Scraped text is untrusted: neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function slugify(s: string) {
  return (
    s
      .replace(/[™®©]/g, "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "") || "product"
  );
}

/**
 * One-product Shopify import file. Imported as a draft (not published) so
 * nothing goes live in the shop until the seller reviews it.
 */
export function shopifyCsv(
  p: Pick<ProductDto, "name" | "description" | "category"> & { merchant?: string | null },
  { price, costPerItem }: { price: number | null; costPerItem: number | null },
) {
  const title = cleanTitle(p.name, p.merchant);
  const row: Record<(typeof SHOPIFY_COLUMNS)[number], string> = {
    Title: title,
    "URL handle": slugify(title),
    Description: p.description
      ? p.description
          .split(/\n{2,}/)
          .map((para) => `<p>${escapeHtml(para.trim())}</p>`)
          .join("")
      : "",
    Vendor: "",
    Type: humanizeSlug(p.category),
    Tags: `${humanizeSlug(p.category)}, ProductRadar`,
    "Published on online store": "false",
    Status: "draft",
    Price: price !== null ? price.toFixed(2) : "",
    "Cost per item": costPerItem !== null ? costPerItem.toFixed(2) : "",
    "Requires shipping": "true",
  };
  const line = (cells: readonly string[]) => cells.map(csvCell).join(",");
  return `${line(SHOPIFY_COLUMNS)}\r\n${line(SHOPIFY_COLUMNS.map((c) => row[c]))}\r\n`;
}
