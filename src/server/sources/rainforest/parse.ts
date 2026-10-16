// Rainforest API (Amazon) search and product-page responses → retail listings with evidence. Pure: no network.
// Response shapes per Rainforest's docs (docs.trajectdata.com › Rainforest › Search results, Product data).

import { MARKETS, type Market, type RetailListing, type RetailProductDetail } from "@/server/live/types";

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

// ── Product page (type=product) ──────────────────────────────────────────────

export type RainforestProductResponse = {
  request_info?: { success?: boolean; message?: string };
  request_metadata?: { processed_at?: string; created_at?: string };
  product?: {
    asin?: unknown;
    title?: unknown;
    link?: unknown;
    brand?: unknown;
    categories_flat?: unknown;
    feature_bullets?: unknown;
    description?: unknown;
    main_image?: { link?: unknown };
    rating?: unknown;
    ratings_total?: unknown;
    recent_sales?: unknown;
    buybox_winner?: {
      price?: Price;
      fulfillment?: { is_sold_by_amazon?: unknown; third_party_seller?: { name?: unknown } };
    };
  };
};

/**
 * A product page → the listing (buy-box price, never the RRP) plus brand, seller, category and text
 * for the resellability checks. Null when there's no product or no price in the market's currency.
 */
export function parseRainforestProduct(json: RainforestProductResponse, market: Market, fallbackTime: Date): RetailProductDetail | null {
  const { amazonDomain, currency, label } = MARKETS[market];
  const p = json.product;
  const id = str(p?.asin);
  const title = str(p?.title);
  const url = str(p?.link);
  const price = p?.buybox_winner?.price ? sellingPrice({ price: p.buybox_winner.price }) : null;
  if (!p || !id || !title || !url || !/^https:\/\//.test(url) || !price || price.currency !== currency) return null;
  const observedAt = str(json.request_metadata?.processed_at) ?? str(json.request_metadata?.created_at) ?? fallbackTime.toISOString();
  const soldByAmazon = p.buybox_winner?.fulfillment?.is_sold_by_amazon === true;
  const sellerName = soldByAmazon ? "Amazon" : str(p.buybox_winner?.fulfillment?.third_party_seller?.name);
  const brand = str(p.brand);
  const rating = num(p.rating);
  const ratingsTotal = num(p.ratings_total);
  const recentSales = str(p.recent_sales);
  const facts = [
    `${price.raw ?? `${price.amount.toFixed(2)} ${price.currency}`} in the buy box on ${label}`,
    sellerName ? `sold by ${sellerName}` : null,
    brand ? `brand ${brand}` : null,
    rating !== null && ratingsTotal !== null ? `rated ${rating}/5 from ${ratingsTotal.toLocaleString("en-US")} ratings` : null,
    recentSales,
  ].filter(Boolean);
  return {
    listing: {
      market,
      id,
      title,
      url,
      image: str(p.main_image?.link),
      price: { amount: price.amount, currency: price.currency },
      rating: rating !== null && rating >= 0 && rating <= 5 ? rating : null,
      ratingsTotal: ratingsTotal !== null && ratingsTotal >= 0 ? Math.round(ratingsTotal) : null,
      sponsored: false,
      recentSales,
      evidence: {
        id: `rainforest:${amazonDomain}:${id}:page`,
        provider: "rainforest",
        sourceUrl: url,
        observedAt,
        quality: RAINFOREST_QUALITY,
        claim: `"${title}" (product page): ${facts.join(", ")}`,
      },
    },
    brand,
    sellerName,
    soldByAmazon,
    category: str(p.categories_flat),
    bulletPoints: Array.isArray(p.feature_bullets) ? p.feature_bullets.map(str).filter((b): b is string => b !== null) : [],
    description: str(p.description),
  };
}
