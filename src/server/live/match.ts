// Do two listings describe the same product? Phase 8 matches on titles only (images come
// with the sellability phase). Pure, deterministic and explainable: a score from 0 to 1.

const STOP = new Set([
  "a", "an", "and", "the", "for", "with", "of", "in", "on", "to", "by", "new", "pack", "set", "pcs", "piece", "pieces",
  "free", "shipping", "hot", "sale", "best", "quality", "high", "original", "genuine", "2024", "2025", "2026",
]);

/** Lower-case word and number tokens; units stay glued to numbers ("20w", "10000mah"). */
export function tokens(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s+(mah|w|v|mm|cm|ml|oz|g|kg|l|in|inch|ft|gb|tb|hz)\b/g, "$1$2")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  return new Set(words);
}

const hasDigit = (t: string) => /\d/.test(t);

/**
 * Title similarity: the share of the shorter title's words found in the longer one (so a
 * supplier's long keyword-stuffed title can still match a short retail one). Any size or spec
 * token ("20w", "10000mah") that appears in both titles' spec sets must agree, else 0.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const specsA = [...ta].filter(hasDigit);
  const specsB = [...tb].filter(hasDigit);
  // Conflicting specs (both state a capacity, but different ones) mean different products.
  if (specsA.length && specsB.length && !specsA.some((s) => tb.has(s))) return 0;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let shared = 0;
  for (const t of small) if (large.has(t)) shared++;
  return shared / small.size;
}

/** The words worth searching a supplier for: the title's tokens, minus the most generic. */
export function searchTermFor(title: string, maxWords = 8): string {
  return [...tokens(title)].slice(0, maxWords).join(" ");
}

/** A supplier listing counts as the product only when its title carries at least this share of the product's key words. */
export const SUPPLIER_MATCH_MIN = 0.8;

// "utensils" and "utensil", "pieces" and "piece" are the same word here.
const singular = (t: string) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);

/**
 * How exactly a supplier listing matches the product, from 0 to 1: the share of the product's key
 * words (the words its supplier search uses, see searchTermFor) found in the supplier's title. It is
 * one-way on purpose: a short or generic supplier title ("Silicone Tongs") can't match a specific
 * product just by being made of some of its words. A size or spec both titles state must agree, else 0.
 */
export function supplierMatchScore(productTitle: string, supplierTitle: string): number {
  const key = [...new Set(searchTermFor(productTitle).split(" ").filter(Boolean).map(singular))];
  const offer = new Set([...tokens(supplierTitle)].map(singular));
  if (key.length === 0 || offer.size === 0) return 0;
  const keySpecs = key.filter(hasDigit);
  const offerSpecs = [...offer].filter(hasDigit);
  if (keySpecs.length && offerSpecs.length && !keySpecs.some((s) => offer.has(s))) return 0;
  return key.filter((t) => offer.has(t)).length / key.length;
}
