// Pure HTML → product facts. No network, no guessing.
//
// Only machine-readable data the page publishes about itself is used, in this
// order of trust: schema.org JSON-LD › Open Graph / product meta tags ›
// schema.org microdata › plain <title>/<meta description>. A price is only
// returned with an explicit currency; we never infer a price from loose text.
// Each fact records where it came from so evidence quality can reflect it.
//
// An RRP is only read where the page labels it as one: a schema.org price
// specification typed MSRP, SRP, ListPrice or MaximumRetailPrice, or the "rrp"
// field THG stores (lookfantastic, Cult Beauty) publish beside each price in their
// page data. A store's own "was" price (StrikethroughPrice) is not an RRP.
//
// Two kinds of page are understood: a store's product page (price, the store's
// own customer rating) and an expert review article that publishes its verdict
// as structured data (a dated score by a named reviewer). A score written only
// in the article text is never read.

import * as cheerio from "cheerio";

// "page-data": a store's own JSON page state (not a public standard), read only for labelled fields.
export type ExtractionMethod = "json-ld" | "open-graph" | "microdata" | "page-data" | "html";

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
  // The RRP the page publishes for the same listing as `price` (never a "was" price).
  rrp: Sourced<Rrp> | null;
  rating: Sourced<{ value: number; best: number }> | null; // value on 0..best
  reviewCount: Sourced<number> | null;
  // An expert's review of the product (never set on a store page — customer
  // reviews there are summarised by `rating`).
  review: Sourced<ExpertReview> | null;
  // True only when the page explicitly declares itself a product: schema.org
  // Product (JSON-LD or microdata), og:type "product", or product price tags.
  declaresProduct: boolean;
};

export type Rrp = { amount: string; currency: string; label: string };

export type ExpertReview = {
  rating: { value: number; best: number };
  itemName: string | null; // what the review says it is about
  author: string | null;
  publishedAt: Date | null;
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

/** A schema.org Rating / AggregateRating as { value, best }, or null if it isn't a usable rating. */
function ratingOf(r: unknown): { value: number; best: number } | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Json;
  const value = Number(text(o.ratingValue));
  const best = Number(text(o.bestRating) ?? 5);
  // schema.org's default worstRating is 1: a 0 on that scale is a placeholder some
  // stores publish before their review widget loads, not a real rating.
  const worst = Number(text(o.worstRating) ?? 1);
  if (![value, best, worst].every(Number.isFinite) || worst < 0 || best <= worst) return null;
  return value >= worst && value <= best ? { value, best } : null;
}

const nameOf = (v: unknown) => {
  const x = first(v as unknown);
  return text(typeof x === "object" && x ? (x as Json).name : x);
};

const pastDate = (v: unknown): Date | null => {
  const s = text(v);
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) && d.getTime() <= Date.now() ? d : null;
};

// schema.org PriceTypeEnumeration members (or free text) that mean a recommended retail price.
const RRP_TYPES: Record<string, string> = {
  msrp: "MSRP",
  srp: "SRP",
  listprice: "list price",
  maximumretailprice: "maximum retail price",
  rrp: "RRP",
};
const NOT_SELLING_PRICE = new Set([...Object.keys(RRP_TYPES), "strikethroughprice"]);
const priceTypeOf = (spec: Json) =>
  String(spec.priceType ?? "")
    .replace(/^https?:\/\/schema\.org\//i, "")
    .replace(/[\s_-]/g, "")
    .toLowerCase();

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

  // Shopify appends its placeholder variant name ("Spot Patch — Default Title") to single-variant products.
  const name = text(product.name)?.replace(/\s+[—–-]\s+Default Title$/i, "");
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
      const specs = [o.priceSpecification].flat().filter((x): x is Json => !!x && typeof x === "object");
      // The selling price never comes from a spec labelled as an RRP or a crossed-out price.
      const spec = specs.find((x) => !NOT_SELLING_PRICE.has(priceTypeOf(x)));
      const amount = normalisePrice(o.price ?? o.lowPrice ?? spec?.price);
      const currency = currencyOf(o.priceCurrency ?? spec?.priceCurrency);
      if (!amount || !currency) return null;
      const rrpSpec = specs.find((x) => RRP_TYPES[priceTypeOf(x)]);
      const rrpAmount = normalisePrice(rrpSpec?.price);
      const rrpCurrency = currencyOf(rrpSpec?.priceCurrency ?? o.priceCurrency);
      const rrp = rrpSpec && rrpAmount && rrpCurrency && Number(rrpAmount) > 0
        ? { amount: rrpAmount, currency: rrpCurrency, label: RRP_TYPES[priceTypeOf(rrpSpec)] }
        : null;
      return { price: { amount, currency, availability: normaliseAvailability(o.availability) }, rrp };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  // Prefer an in-stock price; otherwise the first listed. The RRP is that same offer's.
  const chosen = priced.find((p) => p.price.availability === "IN_STOCK") ?? priced[0];
  if (chosen) {
    out.price = { value: chosen.price, method: m };
    if (chosen.rrp) out.rrp = { value: chosen.rrp, method: m };
  }

  const agg = product.aggregateRating as Json | undefined;
  if (agg && typeof agg === "object") {
    const rating = ratingOf(agg);
    if (rating) out.rating = { value: rating, method: m };
    const count = Number(text(agg.ratingCount) ?? text(agg.reviewCount));
    // A published-but-unusable average (e.g. "0 / 5 from 1,365 reviews") means the summary
    // is broken, so its count isn't trusted either.
    const brokenAverage = !rating && text(agg.ratingValue) !== null && count > 0;
    if (Number.isInteger(count) && count >= 0 && !brokenAverage) out.reviewCount = { value: count, method: m };
  }
  return out;
}

/**
 * An expert review published as structured data: either one top-level Review of
 * an item, or a Product with no offers carrying a single review (how many
 * publishers mark up review articles). A Product with offers is a store page, and
 * its reviews are customers', so it never yields an expert review.
 */
function expertReviewFromJsonLd(nodes: Json[]): Sourced<ExpertReview> | null {
  const products = nodes.filter((n) => isType(n, "product") || isType(n, "productgroup"));
  if (products.some((p) => p.offers)) return null;

  const found: { review: Json; item: Json | undefined }[] = [];
  for (const n of nodes) if (isType(n, "review")) found.push({ review: n, item: first(n.itemReviewed as Json | Json[] | undefined) });
  for (const p of products) {
    if (p.review && !Array.isArray(p.review)) found.push({ review: p.review as Json, item: p });
  }
  if (found.length !== 1) return null; // none, or a list of reviews — not one verdict

  const { review, item } = found[0];
  const rating = ratingOf(review.reviewRating);
  if (!rating) return null;
  const article = nodes.find((n) => ["article", "newsarticle", "reviewnewsarticle", "blogposting"].some((t) => isType(n, t)));
  return {
    value: {
      rating,
      itemName: text(item?.name),
      author: nameOf(review.author),
      publishedAt: pastDate(review.datePublished) ?? pastDate(article?.datePublished),
    },
    method: "json-ld",
  };
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

// ── Store page data ──────────────────────────────────────────────────────────

// THG stores embed each listing's price beside its RRP:
// "price":{"price":{"currency":"GBP","amount":"20.0",…},"rrp":{"currency":"GBP","amount":"20.0",…}}
const THG_PRICE_RRP =
  /"price":\{"currency":"([A-Z]{3})","amount":"(\d+(?:\.\d+)?)"[^{}]*\},"rrp":\{"currency":"([A-Z]{3})","amount":"(\d+(?:\.\d+)?)"/g;

/**
 * The RRP paired with the page's own selling price. Pages also carry other products
 * (recommendations), so only pairs whose price matches are used, and they must all
 * agree on one RRP; anything ambiguous gives no RRP rather than a guess.
 */
export function rrpFromPageData(html: string, price: { amount: string; currency: string }): Sourced<Rrp> | null {
  const rrps = new Set<string>();
  for (const [, cur, amount, rrpCur, rrpAmount] of html.matchAll(THG_PRICE_RRP)) {
    if (cur !== price.currency || normalisePrice(amount) !== price.amount) continue;
    const rrp = normalisePrice(rrpAmount);
    if (rrp && Number(rrp) > 0) rrps.add(`${rrpCur} ${rrp}`);
  }
  if (rrps.size !== 1) return null;
  const [currency, amount] = [...rrps][0].split(" ");
  return { value: { amount, currency, label: "RRP" }, method: "page-data" };
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function extractProduct(html: string, pageUrl: string): ExtractedProduct {
  const $ = cheerio.load(html);
  const nodes = jsonLdNodes($);
  const layers = [fromJsonLd(nodes), fromMeta($), fromMicrodata($), fromHtml($)];
  const review = expertReviewFromJsonLd(nodes);
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

  const price = pick("price");
  // An RRP only counts alongside the price it belongs to: JSON-LD's comes from the
  // same offer; otherwise the store's page data, matched to that price.
  const rrp = !price ? null : price.method === "json-ld" && pick("rrp") ? pick("rrp") : rrpFromPageData(html, price.value);

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
    price,
    rrp,
    rating: pick("rating"),
    reviewCount: pick("reviewCount"),
    // A priced page is a store page, whatever else it marks up.
    review: price ? null : review,
    declaresProduct,
  };
}
