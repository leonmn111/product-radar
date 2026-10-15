// AliExpress Open Platform affiliate API: `aliexpress.affiliate.product.query` response →
// supplier offers with evidence. Pure: no network. Field names follow the official product
// model (product_id, product_title, target_sale_price, target_sale_price_currency,
// product_detail_url, product_main_image_url, lastest_volume, evaluate_rate).
// UNVERIFIED against a live response until the affiliate account is approved (ROADMAP.md).

import type { Market, SupplierOffer } from "@/server/live/types";

// Prices from AliExpress's own official API.
export const ALIEXPRESS_QUALITY = 85;

type Product = {
  product_id?: unknown;
  product_title?: unknown;
  target_sale_price?: unknown;
  target_sale_price_currency?: unknown;
  product_detail_url?: unknown;
  product_main_image_url?: unknown;
  lastest_volume?: unknown; // sic: the API's own spelling
  evaluate_rate?: unknown;
};
export type ProductQueryResponse = {
  aliexpress_affiliate_product_query_response?: {
    resp_result?: {
      resp_code?: number;
      resp_msg?: string;
      result?: { current_record_count?: number; products?: { product?: Product[] } };
    };
  };
  error_response?: { code?: string; msg?: string };
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** The AliExpress error message, or null when the response is a success. */
export function aliexpressError(json: ProductQueryResponse): string | null {
  if (json.error_response) return json.error_response.msg ?? json.error_response.code ?? "error";
  const r = json.aliexpress_affiliate_product_query_response?.resp_result;
  if (!r) return "unexpected response";
  return r.resp_code === undefined || r.resp_code === 200 ? null : (r.resp_msg ?? `code ${r.resp_code}`);
}

export function parseProductQuery(json: ProductQueryResponse, shipTo: Market, observedAt: Date): SupplierOffer[] {
  const products = json.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product ?? [];
  const offers: SupplierOffer[] = [];
  for (const p of products) {
    const id = str(p.product_id);
    const title = str(p.product_title);
    const amount = Number(str(p.target_sale_price));
    const currency = str(p.target_sale_price_currency)?.toUpperCase();
    // A shareable product page, never the affiliate tracking link, is the citation.
    const url = str(p.product_detail_url) ?? (id ? `https://www.aliexpress.com/item/${id}.html` : null);
    if (!id || !title || !url || !/^https:\/\//.test(url) || !Number.isFinite(amount) || amount <= 0 || !currency) continue;
    const sold = str(p.lastest_volume);
    const positive = str(p.evaluate_rate);
    const facts = [`${amount.toFixed(2)} ${currency} on AliExpress, ships to ${shipTo}`, sold ? `${sold} sold recently` : null, positive ? `${positive} positive feedback` : null];
    offers.push({
      id,
      title,
      url,
      image: str(p.product_main_image_url),
      unitPrice: { amount, currency },
      shipping: null, // the affiliate product query doesn't quote shipping
      shipsTo: shipTo,
      evidence: {
        id: `aliexpress:${id}:${shipTo}`,
        provider: "aliexpress",
        sourceUrl: url,
        observedAt: observedAt.toISOString(),
        quality: ALIEXPRESS_QUALITY,
        claim: `"${title}": ${facts.filter(Boolean).join(", ")}`,
      },
    });
  }
  return offers;
}
