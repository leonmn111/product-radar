// Query expansion (ROADMAP.md › Phase 0 › Synonym search). Sellers and shoppers name one product
// many ways ("earbuds", "wireless headphones", "bluetooth earphones"); a search that only uses
// the caller's words misses the listings that use the others. Pure: no network.
//
// Each extra term is another paid retail search, so expansion never saves credits by itself. The
// Dossier service searches the extra terms only when the first search finds too few listings of the
// product, and only as far as the query's budget allows.

/** Names for the same kind of product, as UK listings use them. Each term expands to the others. */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["earbuds", "wireless earbuds", "wireless headphones", "bluetooth earphones"],
  ["leggings", "yoga pants", "gym tights", "workout leggings"],
  ["phone case", "phone cover", "mobile phone case"],
  ["posture corrector", "back brace", "posture support"],
  ["led strip lights", "led light strip", "rgb strip lights"],
  ["pet hair remover", "pet lint roller", "dog hair remover"],
  ["resistance bands", "exercise bands", "workout bands"],
  ["water bottle", "drinks bottle", "gym bottle"],
  ["car phone holder", "car phone mount", "dashboard phone holder"],
  ["ring light", "selfie light", "led ring lamp"],
  ["massage gun", "percussion massager", "muscle massager"],
  ["yoga mat", "exercise mat", "gym mat"],
  ["makeup brushes", "cosmetic brushes", "foundation brushes"],
  ["jewellery organiser", "jewelry organizer", "jewellery box"],
  ["vegetable chopper", "veg chopper", "food chopper"],
  ["dog harness", "puppy harness", "no pull harness"],
  ["cat toy", "interactive cat toy", "kitten toy"],
  ["neck fan", "portable neck fan", "hands free fan"],
  ["laptop stand", "laptop riser", "notebook stand"],
  ["phone tripod", "selfie stick tripod", "tripod phone stand"],
  ["sunset lamp", "sunset projector", "rainbow projector lamp"],
  ["claw clip", "hair claw clip", "hair clip"],
  ["travel pillow", "neck pillow", "travel neck pillow"],
  ["trainers", "sneakers", "running shoes"],
  ["jumper", "sweater", "pullover"],
];

/** At most this many terms come back, the caller's own first. */
export const MAX_TERMS = 4;

/** Lower case, punctuation to spaces, single spaces: "Wireless  Earbuds!" → "wireless earbuds". */
const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every term with its group, longest first, so "wireless earbuds" wins over "earbuds".
const TERMS = SYNONYM_GROUPS.flatMap((group) => group.map((term) => ({ term, group }))).sort((a, b) => b.term.length - a.term.length);

/**
 * The query, then the same query with its product words swapped for each synonym:
 * "pink earbuds" → ["pink earbuds", "pink wireless earbuds", "pink wireless headphones", "pink bluetooth earphones"].
 * A query with no known product words comes back on its own.
 */
export function expandQuery(query: string): string[] {
  const q = clean(query);
  if (!q) return [];
  for (const { term, group } of TERMS) {
    const re = new RegExp(`(^| )${escape(term)}( |$)`);
    if (!re.test(q)) continue;
    const swapped = group.filter((t) => t !== term).map((t) => q.replace(re, `$1${t}$2`));
    return [...new Set([q, ...swapped])].slice(0, MAX_TERMS);
  }
  return [q];
}
