// Resellability flags (ARCHITECTURE.md › Resellability). Pure: reads only the product data it's given.
// Each flag is true when tripped, false when checked and clear, and null when it couldn't be checked;
// every flag says why, and cites the evidence the text came from (CLAUDE.md Rules 3 and 7). Text rules
// err on the side of flagging: this is a zero-tolerance screener.

import { z } from "zod";
import type { ComplianceFlag, ResellabilityFlags } from "@/types/dossier";

const ProductData = z.object({
  title: z.string().trim().min(1, "title is required"),
  brand: z.string().trim().nullish(),
  sellerName: z.string().trim().nullish(),
  category: z.string().trim().nullish(),
  description: z.string().nullish(),
  bulletPoints: z.array(z.string()).nullish(),
  market: z.enum(["UK", "EU"]).default("UK"),
  evidenceIds: z.array(z.string().min(1)).default([]), // the listing evidence the text came from
  trademarkRecords: z.array(z.object({ mark: z.string().min(1), office: z.string().min(1), evidenceId: z.string().min(1) })).default([]),
});

export type ProductData = z.input<typeof ProductData>;

export class ComplianceInputError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid product data: ${issues.join("; ")}`);
    this.name = "ComplianceInputError";
  }
}

// ── Text helpers ─────────────────────────────────────────────────────────────

/** Lower case, accents stripped, punctuation to spaces: "Anker® Direct-UK" → "anker direct uk". */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Words sellers add around a brand name in their store name.
const SELLER_SUFFIXES = new Set(["official", "store", "shop", "direct", "uk", "eu", "gb", "ltd", "limited", "inc", "llc", "co", "gmbh", "group", "the", "online", "global"]);
const compactName = (s: string) =>
  normalise(s)
    .split(" ")
    .filter((w) => w && !SELLER_SUFFIXES.has(w))
    .join("");

const GENERIC_BRANDS = new Set(["generic", "unbranded", "no brand", "nobrand", "none", "n a", "na", "oem", "unknown", "non brand", "white label"]);

/** Marks that commonly appear in reseller listings (brands, and compatibility claims like "for MagSafe"). */
const KNOWN_MARKS: [RegExp, string][] = [
  [/\bmag ?safe\b/, "MagSafe (Apple)"],
  [/\b(apple|iphone|ipad|airpods?|macbook|apple watch)\b/, "Apple"],
  [/\b(samsung|galaxy buds|galaxy watch)\b/, "Samsung"],
  [/\b(anker|ugreen|belkin|baseus|xiaomi|huawei|jbl|bose|beats|sony|logitech|philips|braun|dyson)\b/, "an electronics brand"],
  [/\b(nintendo|playstation|xbox|disney|marvel|pokemon|lego|barbie|hot wheels|nerf|hello kitty)\b/, "an entertainment or toy brand"],
  [/\b(nike|adidas|stanley|owala|yeti|crocs)\b/, "a consumer brand"],
];

// UKCA (Great Britain) / CE (EU) conformity marking: electrical, electronic and radio equipment, and toys.
const UKCA_TERMS =
  /\b(electronic|electrical|charger|charging|power ?bank|batter(y|ies)|usb|bluetooth|wireless|wi ?fi|led|lamp|light bulb|speaker|headphones?|earbuds?|earphones?|adapter|plug|smart ?watch|remote control|drone|camera|heater|kettle|fan|hair dryer|straightener|toys?|kids|children|childrens|baby|plush|doll|board game)\b/;
const COSMETICS_TERMS =
  /\b(cosmetics?|skin ?care|moisturi[sz]er|moisturi[sz]ing|serum|cream|lotion|cleanser|toner|shampoo|conditioner|lipstick|lip gloss|mascara|foundation|concealer|eyeshadow|eyeliner|blush|perfume|eau de|fragrance|deodorant|nail polish|sunscreen|spf|toothpaste|hair dye|face mask|sheet mask|body wash|soap)\b/;
const BATTERY_TERMS = /\b(batter(y|ies)|lithium|li ion|li po|lipo|rechargeable|power ?bank|\d+ ?mah)\b/;

const flag = (value: boolean | null, reason: string, evidenceIds: string[]): ComplianceFlag => ({ value, reason, evidenceIds });

// ── The flagger ──────────────────────────────────────────────────────────────

/**
 * Flags what would stop a white-label reseller: the seller being the brand, a brand or trademark,
 * UKCA/CE-marked categories (electronics, toys), cosmetics rules, and batteries.
 * Takes unknown data (it's often a raw listing) and validates it; throws ComplianceInputError.
 */
export function checkResellability(productData: unknown): ResellabilityFlags {
  const r = ProductData.safeParse(productData);
  if (!r.success) throw new ComplianceInputError(r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`));
  const p = r.data;
  const cite = p.evidenceIds;
  const text = normalise([p.title, p.category ?? "", p.description ?? "", ...(p.bulletPoints ?? [])].join(" "));
  const rawText = [p.title, p.description ?? "", ...(p.bulletPoints ?? [])].join(" ");
  const brand = p.brand && !GENERIC_BRANDS.has(normalise(p.brand)) ? p.brand : null;

  // brandDirect: the seller's name is the brand's (store suffixes like "Official" or "UK" ignored).
  let brandDirect: ComplianceFlag;
  if (!brand) brandDirect = flag(false, p.brand ? `the brand is "${p.brand}" (generic)` : "the listing names no brand", cite);
  else if (!p.sellerName) brandDirect = flag(null, "the seller's name isn't known, so it can't be compared with the brand", cite);
  else {
    const b = compactName(brand);
    const s = compactName(p.sellerName);
    const same = b.length >= 2 && (s === b || (b.length >= 3 && s.includes(b)));
    brandDirect = flag(same, same ? `the seller "${p.sellerName}" is the brand "${brand}"` : `the seller "${p.sellerName}" isn't the brand "${brand}"`, cite);
  }

  // trademarkRisk: a registered mark on record, a ™/® symbol, a named brand, or a known mark in the text.
  const marks = KNOWN_MARKS.filter(([re]) => re.test(text)).map(([, name]) => name);
  let trademarkRisk: ComplianceFlag;
  if (p.trademarkRecords.length) {
    trademarkRisk = flag(true, `registered trademark on record: ${p.trademarkRecords.map((t) => `"${t.mark}" (${t.office})`).join(", ")}`, [
      ...cite,
      ...p.trademarkRecords.map((t) => t.evidenceId),
    ]);
  } else if (/[™®]/.test(rawText)) trademarkRisk = flag(true, "the listing uses a ™ or ® symbol", cite);
  else if (brand) trademarkRisk = flag(true, `the product is sold under the brand "${brand}"`, cite);
  else if (marks.length) trademarkRisk = flag(true, `the listing mentions ${[...new Set(marks)].join(", ")}`, cite);
  else trademarkRisk = flag(false, "no brand, trademark symbol or known mark in the listing text", cite);

  const marking = p.market === "UK" ? "UKCA marking (Great Britain)" : "CE marking (EU)";
  const term = (re: RegExp) => text.match(re)?.[0] ?? null;
  const ukca = term(UKCA_TERMS);
  const cosmetic = term(COSMETICS_TERMS);
  const battery = term(BATTERY_TERMS);

  return {
    brandDirect,
    trademarkRisk,
    requiresUKCA: flag(ukca !== null, ukca ? `"${ukca}" suggests electrical goods or a toy, which need ${marking}` : "no electrical or toy terms in the listing text", cite),
    cosmetics: flag(cosmetic !== null, cosmetic ? `"${cosmetic}" suggests a cosmetic product, which falls under cosmetics regulation` : "no cosmetics terms in the listing text", cite),
    batteries: flag(battery !== null, battery ? `"${battery}" suggests the product is or contains a battery` : "no battery terms in the listing text", cite),
  };
}

/**
 * False when any flag is tripped: every flag is critical (IP: brandDirect, trademarkRisk; regulatory:
 * requiresUKCA, cosmetics, batteries). A flag that couldn't be checked (null) doesn't block on its own,
 * but it is missing evidence, so a Verdict counts it against confidence.
 */
export function isSellable(flags: ResellabilityFlags): boolean {
  return !Object.values(flags).some((f) => f.value === true);
}
