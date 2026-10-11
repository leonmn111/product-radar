// Turns a plain-words query ("Wireless Earbuds", "wireless-earbuds", "moisturizers")
// into search terms. A term matches text containing a word that starts with one of
// its patterns, ignoring case ("oven" finds "ovens" but not "proven"), so each
// pattern is the shortest form that still finds the word's variants: "earbuds" →
// "earbud" (finds earbud, earbuds), "accessories" → "accessor" (finds accessory,
// accessories), plus British/American spellings (moisturiser/moisturizer,
// cancelling/canceling).

export type SearchTerm = {
  word: string; // as typed (lowercased), for reporting which words matched
  patterns: string[]; // word starts; the term matches if a word starts with any of them
  weight: number;
};

const MAX_TERMS = 8;

// Words that would match nearly every product and say nothing about what's wanted.
const STOP_WORDS = new Set(
  (
    "a an and or the for with without of in on to by from at as is are be my your our me i we you it this that these those " +
    "best top good great new cheap buy buying find show list some any all products product items item stuff things thing " +
    "under over about like similar"
  ).split(" "),
);

const stripAccents = (s: string) => s.normalize("NFKD").replace(/\p{M}+/gu, "");

/** A prefix that finds the singular and plural forms of an English word. */
function stem(word: string) {
  // accessories → accessor; short words keep more ("series" → "serie", not "ser", which would find "serum")
  if (word.length >= 7 && word.endsWith("ies")) return word.slice(0, -3);
  if (word.length > 4 && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2); // glasses → glass
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1); // earbuds → earbud
  if (word.length > 3 && word.endsWith("y")) return word.slice(0, -1); // accessory → accessor
  return word;
}

/** British and American spellings: -ise/-ize, -yse/-yze, and -lling/-ling, -lled/-led, -ller/-ler. */
function spellings(s: string) {
  const out = new Set([s]);
  if (/ll(ing|ed|er)/.test(s)) out.add(s.replace(/ll(ing|ed|er)/g, "l$1"));
  if (/[^l]l(ing|ed|er)/.test(s)) out.add(s.replace(/([^l])l(ing|ed|er)/g, "$1ll$2"));
  if (/i[sz][aei]/.test(s)) {
    out.add(s.replace(/iz([aei])/g, "is$1"));
    out.add(s.replace(/is([aei])/g, "iz$1"));
  }
  if (/y[sz]e/.test(s)) {
    out.add(s.replace(/yze/g, "yse"));
    out.add(s.replace(/yse/g, "yze"));
  }
  return [...out];
}

export function parseSearch(text: string): SearchTerm[] {
  const words = [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 1 && !STOP_WORDS.has(w)),
    ),
  ].slice(0, MAX_TERMS);

  return words.map((word, i) => ({
    word,
    patterns: [...new Set([word, stripAccents(word)].map(stem).flatMap(spellings))],
    // The last word usually names the thing ("earbuds" in "wireless earbuds"),
    // so it counts double: an earbud beats a wireless charger.
    weight: i === words.length - 1 && words.length > 1 ? 2 : 1,
  }));
}

/**
 * The least total weight a product must match to be a result: half the query.
 * With the last word counting double, "wireless earbuds" needs "earbuds" (an
 * earbud qualifies, a wireless charger doesn't), and "noise cancelling
 * headphones" needs "headphones" or both of the other words.
 */
export function minimumMatch(terms: SearchTerm[]) {
  return terms.reduce((sum, t) => sum + t.weight, 0) / 2;
}

/** A category name in any form ("Tech Accessories", "tech_accessories") as a slug. */
export function toCategorySlug(text: string) {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
