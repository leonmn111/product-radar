import type { ProductDto } from "@/server/products/service";

export type Dimension = "OVERALL" | "QUALITY" | "VALUE" | "DEMAND" | "SENTIMENT" | "TREND";
export type Score = ProductDto["scores"][string];
export type Evidence = ProductDto["evidence"][number];
export type Offer = ProductDto["offers"][number];

export const SUB_DIMENSIONS: Dimension[] = ["QUALITY", "VALUE", "DEMAND", "SENTIMENT", "TREND"];

export const DIMENSION_LABEL: Record<Dimension, string> = {
  OVERALL: "Overall",
  QUALITY: "Quality",
  VALUE: "Value",
  DEMAND: "Demand",
  SENTIMENT: "Sentiment",
  TREND: "Trend",
};

export const DIMENSION_HELP: Record<Dimension, string> = {
  OVERALL: "Weighted blend of the other scores",
  QUALITY: "From star ratings",
  VALUE: "Quality vs. price compared with the category",
  DEMAND: "From review counts",
  SENTIMENT: "From discussion tone",
  TREND: "Direction of search interest over time",
};

export const getScore = (p: ProductDto, d: Dimension): Score | undefined => p.scores[d];

/** The product's full-page dossier. */
export const dossierHref = (p: Pick<ProductDto, "slug">) => `/dossier/${encodeURIComponent(p.slug)}`;

export function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatPrice(amount: string, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}

export function formatConfidence(c: number) {
  return `${Math.round(c * 100)}%`;
}

export type ConfidenceLevel = "low" | "medium" | "high";
export function confidenceLevel(c: number): ConfidenceLevel {
  if (c < 0.3) return "low";
  if (c < 0.6) return "medium";
  return "high";
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function formatRelative(iso: string, now = Date.now()) {
  const days = Math.round((new Date(iso).getTime() - now) / 86_400_000);
  if (Math.abs(days) < 1) {
    const hours = Math.round((new Date(iso).getTime() - now) / 3_600_000);
    return rtf.format(hours, "hour");
  }
  if (Math.abs(days) < 60) return rtf.format(days, "day");
  return rtf.format(Math.round(days / 30), "month");
}

// Always UTC: these are rendered on the server and again in the visitor's browser, and both must agree.
const DATE_TIME_UTC = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
export function formatDateTime(iso: string) {
  return `${DATE_TIME_UTC.format(new Date(iso))} UTC`;
}

export function formatMetric(m: NonNullable<Evidence["metric"]>) {
  switch (m.type) {
    case "RATING":
      return `Rating ${m.value.toFixed(1)} / 5`;
    case "REVIEW_COUNT":
      return `${Math.round(m.value).toLocaleString("en-US")} reviews`;
    case "SENTIMENT":
      return `Sentiment ${m.value > 0 ? "+" : ""}${m.value.toFixed(2)}`;
    case "SEARCH_INTEREST":
      return `Search interest ${Math.round(m.value)} / 100`;
  }
}

export const SOURCE_TYPE_LABEL: Record<Evidence["source"]["type"], string> = {
  MANUFACTURER: "Manufacturer",
  RETAILER: "Retailer",
  REVIEW: "Review",
  FORUM: "Forum",
  NEWS: "News",
  SOCIAL: "Social",
  MARKETPLACE: "Marketplace",
  OTHER: "Other",
};

export const AVAILABILITY_LABEL: Record<Offer["availability"], string> = {
  IN_STOCK: "In stock",
  OUT_OF_STOCK: "Out of stock",
  PREORDER: "Pre-order",
  DISCONTINUED: "Discontinued",
  UNKNOWN: "Unknown",
};
