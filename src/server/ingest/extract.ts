// Pure HTML → product facts. No network, no guessing.
//
// Only machine-readable data the page publishes about itself is used, in this
// order of trust: schema.org JSON-LD › Open Graph / product meta tags ›
// schema.org microdata › plain <title>/<meta description>. A price is only
// returned with an explicit currency; we never infer a price from loose text.
// Each fact records where it came from so evidence quality can reflect it.

import * as cheerio from "cheerio";

export type ExtractionMethod = "json-ld" | "open-graph" | "microdata" | "html";

export type Sourced<T> = { value: T; method: ExtractionMethod };

export type ExtractedAvailability = "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER" | "DISCONTINUED" | "UNKNOWN";

export type ExtractedProduct = {
  title: Sourced<string> | null;
  description: Sourced<string> | null;
  brand: Sourced<string> | null;
  imageUrl: Sourced<string> | null;
  canonicalUrl: string | null;
  category: Sourced<string> | null;
  price: Sourced<{ amount: string; currency: string; availability: ExtractedAvailability }> | null;
  rating: Sourced<{ value: number; best: number }> | null; // value on 0..best
  reviewCount: Sourced<number> | null;
  // True only when the page explicitly declares itself a product: schema.org
  // Product (JSON-LD or microdata), og:type "product", or product price tags.
  declaresProduct: boolean;
};

type Json = Record<string, unknown>;

const text = (v: unknown): string | null => {
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim() || null;
  if (typeof v === "number") return String(v);
  return null;
};
const first = <T>(v: T | T[] | undefined | null): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));
const isType = (node: Json, type: string) => {
  const t = node["@type"];
  return Array.isArray(t) ? t.some((x) => String(x).toLowerCase() === type) : String(t ?? "").toLowerCase() === type;
};

/** Parses "1,299.00", "1.299,00", "$49", 49.5 → canonical "1299.00". Null if not a clean number. */
export function normalisePrice(raw: unknown): string | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw.toFixed(2) : null;
  const s = text(raw);
  if (!s) return null;
  const cleaned = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(cleaned)) return null;
  let n: number;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot && cleaned.length - lastComma - 1 <= 2) {
    n = Number(cleaned.replace(/\./g, "").replace(",", ".")); // 1.299,00
  } else {
    n = Number(cleaned.replace(/,/g, "")); // 1,299.00
  }
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
}

export function normaliseAvailability(raw: unknown): ExtractedAvailability {
  // Accepts schema.org URLs ("https://schema.org/InStock") and loose forms ("in stock", "in_stock").
  const s = String(raw ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (/outofstock|soldout/.test(s)) return "OUT_OF_STOCK";
  if (/discontinued/.test(s)) return "DISCONTINUED";
  if (/preorder|presale|backorder/.test(s)) return "PREORDER";
  if (/instock|limitedavailability|onlineonly|instoreonly/.test(s)) return "IN_STOCK";
  return "UNKNOWN";
}

const currencyOf = (v: unknown) => {
  const c = text(v)?.toUpperCase();
  return c && /^[A-Z]{3}$/.test(c) ? c : null;
};

// ── JSON-LD ──────────────────────────────────────────────────────────────────

function jsonLdNodes($: cheerio.CheerioAPI): Json[] {
  const nodes: Json[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Json;
      nodes.push(o);
      if (o["@graph"]) visit(o["@graph"]);
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {
      /* malformed block — skip it, never guess */
    }
  });
  return nodes;
}

function fromJsonLd(nodes: Json[]): Partial<ExtractedProduct> {
  const product = nodes.find((n) => isType(n, "product")) ?? nodes.find((n) => isType(n, "productgroup"));
  if (!product) return {};
  const m = "json-ld" as const;
  const out: Partial<ExtractedProduct> = {};

  const name = text(product.name);
  if (name) out.title = { value: name, method: m };
  const desc = text(product.description);
  if (desc) out.description = { value: desc, method: m };
  const brand = first(product.brand as unknown);
  const brandName = text(typeof brand === "object" && brand ? (brand as Json).name : brand);
  if (brandName) out.brand = { value: brandName, method: m };
  const image = first(product.image as unknown);
  const imageUrl = text(typeof image === "object" && image ? (image as Json).url : image);
  if (imageUrl) out.imageUrl = { value: imageUrl, method: m };
  const category = text(first(product.category as unknown));
  if (category) out.category = { value: category, method: m };

  // Offers: Offer, Offer[], AggregateOffer, or nested on ProductGroup variants.
  const offerCandidates: Json[] = [];
  const collect = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") {
      const o = v as Json;
      if (isType(o, "aggregateoffer") && o.offers) collect(o.offers);
      offerCandidates.push(o);
    }
  };
  collect(product.offers);
  if (product.hasVariant) for (const variant of [product.hasVariant].flat() as Json[]) collect(variant?.offers);

  const priced = offerCandidates
    .map((o) => {
      const spec = first(o.priceSpecification as unknown) as Json | undefined;
      const amount = normalisePrice(o.price ?? o.lowPrice ?? spec?.price);
      const currency = currencyOf(o.priceCurrency ?? spec?.priceCurrency);
      return amount && currency ? { amount, currency, availability: normaliseAvailability(o.availability) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  // Prefer an in-stock price; otherwise the first listed.
  const chosen = priced.find((p) => p.availability === "IN_STOCK") ?? priced[0];
  if (chosen) out.price = { value: chosen, method: m };

  const agg = product.aggregateRating as Json | undefined;
  if (agg && typeof agg === "object") {
    const value = Number(text(agg.ratingValue));
    const best = Number(text(agg.bestRating) ?? 5);
    if (Number.isFinite(value) && Number.isFinite(best) && best > 0 && value >= 0 && value <= best) {
      out.rating = { value: { value, best }, method: m };
    }
    const count = Number(text(agg.ratingCount) ?? text(agg.reviewCount));
    if (Number.isInteger(count) && count >= 0) out.reviewCount = { value: count, method: m };
  }
  return out;
}

// ── Meta tags & microdata ────────────────────────────────────────────────────

function fromMeta($: cheerio.CheerioAPI): Partial<ExtractedProduct> {
  const meta = (...keys: string[]) => {
    for (const k of keys) {
      const v = text($(`meta[property="${k}"], meta[name="${k}"]`).first().attr("content"));
      if (v) return v;
    }
    return null;
  };
  const og = "open-graph" as const;
  const out: Partial<ExtractedProduct> = {};
  const title = meta("og:title", "twitter:title");
  if (title) out.title = { value: title, method: og };
  const desc = meta("og:description", "twitter:description");
  if (desc) out.description = { value: desc, method: og };
  const image = meta("og:image", "twitter:image");
  if (image) out.imageUrl = { value: image, method: og };
  const brand = meta("product:brand", "og:brand");
  if (brand) out.brand = { value: brand, method: og };

  const amount = normalisePrice(meta("product:price:amount", "og:price:amount"));
  const currency = currencyOf(meta("product:price:currency", "og:price:currency"));
  if (amount && currency) {
    out.price = {
      value: { amount, currency, availability: normaliseAvailability(meta("product:availability", "og:availability")) },
      method: og,
    };
  }
  return out;
}

function fromMicrodata($: cheerio.CheerioAPI): Partial<ExtractedProduct> {
  const scope = $('[itemtype*="schema.org/Product" i]').first();
  if (!scope.length) return {};
  const prop = (name: string) => {
    const el = scope.find(`[itemprop="${name}"]`).first();
    return text(el.attr("content") ?? el.attr("href") ?? el.text());
  };
  const md = "microdata" as const;
  const out: Partial<ExtractedProduct> = {};
  const name = prop("name");
  if (name) out.title = { value: name, method: md };
  const desc = prop("description");
  if (desc) out.description = { value: desc, method: md };
  const amount = normalisePrice(prop("price"));
  const currency = currencyOf(prop("priceCurrency"));
  if (amount && currency) {
    out.price = { value: { amount, currency, availability: normaliseAvailability(prop("availability")) }, method: md };
  }
  return out;
}

function fromHtml($: cheerio.CheerioAPI): Partial<ExtractedProduct> {
  const out: Partial<ExtractedProduct> = {};
  const title = text($("title").first().text());
  if (title) out.title = { value: title, method: "html" };
  const desc = text($('meta[name="description"]').attr("content"));
  if (desc) out.description = { value: desc, method: "html" };
  return out;
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function extractProduct(html: string, pageUrl: string): ExtractedProduct {
  const $ = cheerio.load(html);
  const nodes = jsonLdNodes($);
  const layers = [fromJsonLd(nodes), fromMeta($), fromMicrodata($), fromHtml($)];
  const ogType = $('meta[property="og:type"]').attr("content")?.toLowerCase() ?? "";
  const declaresProduct =
    nodes.some((n) => isType(n, "product") || isType(n, "productgroup")) ||
    $('[itemtype*="schema.org/Product" i]').length > 0 ||
    ogType.includes("product") ||
    $('meta[property="product:price:amount"], meta[property="og:price:amount"]').length > 0;
  const pick = <K extends keyof ExtractedProduct>(k: K) =>
    (layers.find((l) => l[k] != null)?.[k] ?? null) as ExtractedProduct[K];

  const canonicalHref = $('link[rel="canonical"]').attr("href") ?? $('meta[property="og:url"]').attr("content");
  let canonicalUrl: string | null = null;
  try {
    if (canonicalHref) {
      const u = new URL(canonicalHref, pageUrl);
      // Only trust a canonical on the same site — avoids a page claiming to be another store's product.
      if (u.hostname.replace(/^www\./, "") === new URL(pageUrl).hostname.replace(/^www\./, "")) canonicalUrl = u.toString();
    }
  } catch {
    canonicalUrl = null;
  }

  const imageUrl = pick("imageUrl");
  if (imageUrl) {
    try {
      imageUrl.value = new URL(imageUrl.value, pageUrl).toString();
    } catch {
      /* leave as-is */
    }
  }

  return {
    title: pick("title"),
    description: pick("description"),
    brand: pick("brand"),
    imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl.value) ? imageUrl : null,
    canonicalUrl,
    category: pick("category"),
    price: pick("price"),
    rating: pick("rating"),
    reviewCount: pick("reviewCount"),
    declaresProduct,
  };
}
