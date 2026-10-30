// Reads which product a visitor means from whatever they paste into the homepage check: an Amazon UK link
// (or a bare ASIN), an AliExpress product link, or a TikTok Shop product link. Pure, no network: short
// links aren't followed (the visitor is asked for the full one), and TikTok Shop pages are never fetched
// (CLAUDE.md Rule 8). A TikTok Shop link is read for the product name in its address, which the check
// then finds on Amazon UK; a link without a name in it can't be checked, and says so.

import { parseAmazonUkLink } from "./amazonLink";

export type ProductLink =
  | { ok: true; kind: "amazon"; asin: string }
  | { ok: true; kind: "aliexpress"; productId: string }
  | { ok: true; kind: "tiktok"; name: string; productId: string | null }
  | { ok: false; message: string };

const fail = (message: string): ProductLink => ({ ok: false, message });

const ALIEXPRESS_HOST = /(^|\.)aliexpress\.(com|us|co\.uk|ru)$/;
const ALIEXPRESS_ITEM = /\/(?:item|i)\/(\d{6,20})\.html/;
const TIKTOK_HOST = /(^|\.)tiktok\.com$/;
// /shop/pdp/<name>/<id>, /uk/pdp/<name>/<id>, /pdp/<name>/<id>
const TIKTOK_PDP = /\/pdp\/([^/?#]+)\/(\d{6,25})(?=[/?#]|$)/;
const TIKTOK_ID_ONLY = /\/(?:view\/)?product\/(\d{6,25})(?=[/?#]|$)/;

/** "silicone-kitchen-utensil-set-12-piece" → "silicone kitchen utensil set 12 piece". */
function nameFromSlug(slug: string): string {
  let text = slug;
  try {
    text = decodeURIComponent(slug);
  } catch {
    // a malformed escape: read it as it is
  }
  return text
    .replace(/[-_+]+/g, " ")
    .replace(/[^\p{L}\p{N}&' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function parseProductLink(input: string): ProductLink {
  const text = input.trim();
  if (!text) return fail("Paste a TikTok Shop, Amazon UK or AliExpress product link.");

  const amazon = parseAmazonUkLink(text);
  if (amazon.ok) return { ok: true, kind: "amazon", asin: amazon.asin };
  if (amazon.reason !== "not_amazon") return fail(amazon.message);

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return fail("That isn't a link we can read. Paste a TikTok Shop, Amazon UK or AliExpress product link.");
  }
  const host = url.hostname.toLowerCase();

  if (ALIEXPRESS_HOST.test(host)) {
    if (/^(a|s\.click)\.aliexpress\.com$/.test(host)) return fail("That's a short AliExpress link. Open it, then paste the full product address from your browser.");
    const id = url.pathname.match(ALIEXPRESS_ITEM)?.[1] ?? url.searchParams.get("productId");
    return id && /^\d{6,20}$/.test(id) ? { ok: true, kind: "aliexpress", productId: id } : fail("That AliExpress link doesn't point at one product. Open the product page and paste its link.");
  }

  if (TIKTOK_HOST.test(host)) {
    if (/^(vm|vt)\.tiktok\.com$/.test(host)) return fail("That's a short TikTok link. Open it, then paste the full product address from your browser.");
    const pdp = url.pathname.match(TIKTOK_PDP);
    if (pdp) {
      const name = nameFromSlug(pdp[1]);
      if (name.split(" ").length >= 2) return { ok: true, kind: "tiktok", name, productId: pdp[2] };
    }
    if (pdp || TIKTOK_ID_ONLY.test(url.pathname)) {
      return fail("This TikTok Shop link doesn't include the product's name, so we can't look it up. Open the product page in a browser and paste the address that has the name in it, or paste the product's Amazon UK link.");
    }
    return fail("That TikTok link isn't a TikTok Shop product. Paste the product page's link.");
  }

  return fail("Paste a TikTok Shop, Amazon UK or AliExpress product link.");
}
