// Rainforest API (Amazon) search response → retail listings with evidence. Pure: no network.
// Response shape per Rainforest's docs (docs.trajectdata.com › Rainforest › Search results).

import { MARKETS, type Market, type RetailListing } from "@/server/live/types";

// Prices and ratings read from Amazon's own result page by a data provider.
export const RAINFOREST_QUALITY = 80;

type Price = { value?: unknown; currency?: unknown; raw?: unknown; is_primary?: unknown };
type Item = {
  asin?: unknown;
  title?: unknown;
  link?: unknown;
  image?: unknown;
  price?: Price;
  prices?: Price[];
  rating?: unknown;
  ratings_total?: unknown;
  sponsored?: unknown;
  recent_sales?: unknown;
};
export type RainforestSearchResponse = {
  request_info?: { success?: boolean; message?: string; credits_used_this_request?: number };
  request_metadata?: { processed_at?: string; created_at?: string };
  search_results?: Item[];
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The listing's selling price: the primary price, never an RRP or list price. */
function sellingPrice(item: Item) {
  const candidates = [item.price, ...(item.prices ?? []).filter((p) => p?.is_primary === true)];
  for (const p of candidates) {
    const value = num(p?.value);
    const currency = str(p?.currency)?.toUpperCase();
    if (value !== null && value > 0 && currency) return { amount: value, currency, raw: str(p?.raw) };
  }
  return null;
}

export function parseRainforestSearch(json: RainforestSearchResponse, market: Market, fallbackTime: Date): RetailListing[] {
  const { amazonDomain, currency, label } = MARKETS[market];
  const observedAt = str(json.request_metadata?.processed_at) ?? str(json.request_metadata?.created_at) ?? fallbackTime.toISOString();
  const listings: RetailListing[] = [];
  for (const item of json.search_results ?? []) {
    const id = str(item.asin);
    const title = str(item.title);
    const url = str(item.link);
    const price = sellingPrice(item);
    // Only priced listings in the market's own currency; nothing is converted or guessed.
    if (!id || !title || !url || !/^https:\/\//.test(url) || !price || price.currency !== currency) continue;
    const rating = num(item.rating);
    const ratingsTotal = num(item.ratings_total);
    const recentSales = str(item.recent_sales);
    const facts = [
      `${price.raw ?? `${price.amount.toFixed(2)} ${price.currency}`} on ${label}`,
      rating !== null && ratingsTotal !== null ? `rated ${rating}/5 from ${ratingsTotal.toLocaleString("en-US")} ratings` : null,
      recentSales,
    ].filter(Boolean);
    listings.push({
      market,
      id,
      title,
      url,
      image: str(item.image),
      price: { amount: price.amount, currency: price.currency },
      rating: rating !== null && rating >= 0 && rating <= 5 ? rating : null,
      ratingsTotal: ratingsTotal !== null && ratingsTotal >= 0 ? Math.round(ratingsTotal) : null,
      sponsored: item.sponsored === true,
      recentSales,
      evidence: {
        id: `rainforest:${amazonDomain}:${id}`,
        provider: "rainforest",
        sourceUrl: url,
        observedAt,
        quality: RAINFOREST_QUALITY,
        claim: `"${title}": ${facts.join(", ")}`,
      },
    });
  }
  return listings;
}
