// Reads the Amazon UK product (ASIN) out of whatever a visitor pastes: a full amazon.co.uk link in any of
// Amazon's URL shapes, or a bare ASIN. Pure, no network: short links (amzn.eu, amzn.to) aren't followed,
// so the visitor is asked for the full link instead. Other marketplaces get a plain explanation.

export type AmazonLink = { ok: true; asin: string } | { ok: false; reason: "empty" | "short_link" | "other_amazon" | "not_amazon" | "no_asin"; message: string };

const ASIN = /^[A-Z0-9]{10}$/;
// /dp/ASIN, /gp/product/ASIN, /gp/aw/d/ASIN, /exec/obidos/ASIN, /o/ASIN, /product-reviews/ASIN
const PATH_ASIN = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/(?:asin|ASIN)|o|product-reviews)\/([A-Za-z0-9]{10})(?=[/?#]|$)/;

const FAIL = {
  empty: "Paste an Amazon UK product link or its ASIN.",
  short_link: "That's a short link. Open it, then paste the full amazon.co.uk address from your browser.",
  other_amazon: "We check Amazon UK listings today. Paste the amazon.co.uk link for this product.",
  not_amazon: "That isn't an Amazon UK link. Paste the amazon.co.uk link for this product.",
  no_asin: "That Amazon UK link doesn't point at one product. Open the product page and paste its link.",
} as const;
const fail = (reason: keyof typeof FAIL): AmazonLink => ({ ok: false, reason, message: FAIL[reason] });

export function parseAmazonUkLink(input: string): AmazonLink {
  const text = input.trim();
  if (!text) return fail("empty");
  if (ASIN.test(text.toUpperCase()) && !text.includes(".")) return { ok: true, asin: text.toUpperCase() };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return fail("not_amazon");
  }
  const host = url.hostname.toLowerCase().replace(/^(www|smile|m)\./, "");
  if (host === "amzn.eu" || host === "amzn.to" || host === "a.co") return fail("short_link");
  if (host !== "amazon.co.uk") return /(^|\.)amazon\.[a-z.]+$/.test(host) ? fail("other_amazon") : fail("not_amazon");

  const fromPath = url.pathname.match(PATH_ASIN)?.[1];
  const fromQuery = url.searchParams.get("asin") ?? url.searchParams.get("ASIN");
  const asin = (fromPath ?? fromQuery ?? "").toUpperCase();
  return ASIN.test(asin) ? { ok: true, asin } : fail("no_asin");
}
