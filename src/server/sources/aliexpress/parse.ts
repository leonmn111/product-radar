// AliExpress Open Platform, Drop Shipping API: `aliexpress.ds.text.search` response → supplier
// offers with evidence. Pure: no network. Field names follow the live response, recorded in
// fixtures/recorded-text-search-GB.json (itemId, title, targetSalePrice, targetOriginalPriceCurrency,
// itemMainPic, orders, evaluateRate, score).

import type { Market, SupplierOffer, SupplierProduct } from "@/server/live/types";

// Prices from AliExpress's own official API.
export const ALIEXPRESS_QUALITY = 85;

type Product = {
  itemId?: unknown;
  title?: unknown;
  targetSalePrice?: unknown; // in the currency asked for
  targetOriginalPriceCurrency?: unknown; // that currency
  originMinPrice?: unknown; // a JSON string that also names it: {"currencyCode":"GBP",…}
  itemMainPic?: unknown;
  orders?: unknown; // AliExpress's own words, e.g. "84" or "50,000+"
  evaluateRate?: unknown; // positive feedback, % ("96.2")
  score?: unknown; // star rating out of 5 ("4.8")
};
export type TextSearchResponse = {
  aliexpress_ds_text_search_response?: {
    code?: string;
    msg?: string;
    data?: { totalCount?: number; products?: { selection_search_product?: Product[] } };
  };
  error_response?: { code?: string; msg?: string };
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** The AliExpress error message, or null when the response is a success. */
export function aliexpressError(json: TextSearchResponse): string | null {
  if (json.error_response) return json.error_response.msg ?? json.error_response.code ?? "error";
  const r = json.aliexpress_ds_text_search_response;
  if (!r) return "unexpected response";
  return r.code === "00" ? null : (r.msg ?? `code ${r.code ?? "missing"}`);
}

/** True when AliExpress refused the access token (invalid, expired or revoked). */
export const tokenRejected = (json: TextSearchResponse) => json.error_response?.code === "IllegalAccessToken";

function currencyOf(p: Product): string | null {
  const named = str(p.targetOriginalPriceCurrency);
  if (named) return named.toUpperCase();
  try {
    return str(JSON.parse(String(p.originMinPrice)).currencyCode)?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

export function parseTextSearch(json: TextSearchResponse, shipTo: Market, observedAt: Date): SupplierOffer[] {
  const products = json.aliexpress_ds_text_search_response?.data?.products?.selection_search_product ?? [];
  const offers: SupplierOffer[] = [];
  for (const p of products) {
    const id = str(p.itemId);
    const title = str(p.title);
    const amount = Number(str(p.targetSalePrice));
    const currency = currencyOf(p);
    if (!id || !/^\d+$/.test(id) || !title || !Number.isFinite(amount) || amount <= 0 || !currency) continue;
    // The plain product page is the citation: the search's own link carries tracking parameters.
    const url = `https://www.aliexpress.com/item/${id}.html`;
    const image = str(p.itemMainPic);
    const orders = str(p.orders);
    const positive = str(p.evaluateRate)?.replace(/%$/, "");
    const stars = str(p.score);
    const facts = [
      `${amount.toFixed(2)} ${currency} on AliExpress, ships to ${shipTo}`,
      orders ? `${orders} orders` : null,
      positive ? `${positive}% positive feedback` : null,
      stars ? `rated ${stars}/5` : null,
    ];
    offers.push({
      id,
      title,
      url,
      image: image && /^https:\/\//.test(image) ? image : null,
      unitPrice: { amount, currency },
      shipping: null, // the search doesn't quote shipping (aliexpress.ds.freight.query does, per item)
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

// ── One product: aliexpress.ds.product.get ───────────────────────────────────
// Field names follow the live response, recorded in fixtures/recorded-product-get-GB.json.

type Sku = { offer_sale_price?: unknown; sku_price?: unknown; currency_code?: unknown; sku_available_stock?: unknown };
export type ProductGetResponse = {
  aliexpress_ds_product_get_response?: {
    rsp_code?: number | string;
    rsp_msg?: string;
    result?: {
      ae_item_base_info_dto?: { subject?: unknown; product_id?: unknown; product_status_type?: unknown };
      ae_item_sku_info_dtos?: { ae_item_sku_info_d_t_o?: Sku[] };
      ae_item_properties?: { ae_item_property?: { attr_name?: unknown; attr_value?: unknown }[] };
    };
  };
  error_response?: { code?: string; msg?: string };
};

/** The AliExpress error message for a product request, or null when it succeeded. */
export function productGetError(json: ProductGetResponse): string | null {
  if (json.error_response) return json.error_response.msg ?? json.error_response.code ?? "error";
  const r = json.aliexpress_ds_product_get_response;
  if (!r) return "unexpected response";
  return String(r.rsp_code) === "200" ? null : (r.rsp_msg ?? `code ${r.rsp_code ?? "missing"}`);
}

/**
 * The listing a product page shows: its title, its cheapest variant that's in stock (the sale price, in
 * the currency asked for) and the brand it states. Null when it isn't on sale or has no priced variant.
 */
export function parseProductGet(json: ProductGetResponse, shipTo: Market, observedAt: Date): SupplierProduct | null {
  const r = json.aliexpress_ds_product_get_response?.result;
  const base = r?.ae_item_base_info_dto;
  const id = str(base?.product_id);
  const title = str(base?.subject);
  if (!id || !/^\d+$/.test(id) || !title || (str(base?.product_status_type) ?? "onSelling") !== "onSelling") return null;
  const prices = (r?.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o ?? [])
    .filter((s) => Number(str(s.sku_available_stock) ?? "1") > 0)
    .map((s) => ({ amount: Number(str(s.offer_sale_price) ?? str(s.sku_price)), currency: str(s.currency_code)?.toUpperCase() ?? null }))
    .filter((p): p is { amount: number; currency: string } => Number.isFinite(p.amount) && p.amount > 0 && p.currency !== null);
  if (prices.length === 0) return null;
  const cheapest = prices.reduce((a, b) => (b.amount < a.amount ? b : a));
  const brandValue = str(r?.ae_item_properties?.ae_item_property?.find((p) => str(p.attr_name)?.toLowerCase() === "brand name")?.attr_value);
  const brand = brandValue && !/^(none|no brand|unbranded|generic|oem)$/i.test(brandValue) ? brandValue : null;
  const url = `https://www.aliexpress.com/item/${id}.html`;
  return {
    id,
    title,
    url,
    image: null,
    unitPrice: { amount: cheapest.amount, currency: cheapest.currency },
    shipping: null,
    shipsTo: shipTo,
    brand,
    evidence: {
      id: `aliexpress:${id}:${shipTo}`,
      provider: "aliexpress",
      sourceUrl: url,
      observedAt: observedAt.toISOString(),
      quality: ALIEXPRESS_QUALITY,
      claim: `"${title}": from ${cheapest.amount.toFixed(2)} ${cheapest.currency} on AliExpress (cheapest variant in stock), ships to ${shipTo}`,
    },
  };
}
