// The catalog seed (src/scripts/seed-catalog.ts): a CSV of unbranded products, each run through the homepage
// check's engine and gates (services/quickVerdict.ts) on its live Amazon UK listings, then saved to the
// catalog with its evidence. Pure: parsing, validation and the verdict; the script does the I/O.
//
// CSV columns (a header row first, any order):
//   productUrl     an Amazon UK product link: its listings set the UK selling price, as on the homepage
//   title          the catalog name
//   imageUrl       an https image of the product (may be blank)
//   supplierPrice  £ per unit, as the supplier lists it for UK delivery
//   category       a catalog category slug, e.g. "home-kitchen"
//   supplierUrl    the supplier listing the price was read from: every figure cites its source (Rule 3)
//
// An AliExpress supplierUrl is read like a pasted AliExpress link on the homepage: the brand checks run on
// that listing (what the seller would sell), its title must match the Amazon UK product's (the homepage's
// LISTING_MATCH_MIN), and Amazon UK only sets the selling price. Any other supplier link: the brand checks
// run on the Amazon UK listing itself.

import { createHash } from "node:crypto";
import { LISTING_MATCH_MIN, titleSimilarity } from "@/server/live/match";
import { parseProductLink } from "@/server/live/productLink";
import { parseSupplierPrice, quickVerdict, subjectFlags, type QuickResult } from "@/services/quickVerdict";
import type { Dossier, Evidence } from "@/types/dossier";

export const SEED_COLUMNS = ["productUrl", "title", "imageUrl", "supplierPrice", "category", "supplierUrl"] as const;

export type SeedRow = {
  /** The CSV line it came from (the header is line 1). */
  line: number;
  asin: string;
  /** The canonical Amazon UK address, the product's unique key in the catalog. */
  productUrl: string;
  title: string;
  imageUrl: string | null;
  supplierPrice: number;
  category: string;
  supplierUrl: string;
};

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field !== "" || row.length) endRow();
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const httpsUrl = (v: string) => {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};
const CATEGORY = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The rows, or why each bad one was refused (by line). Nothing is half-read: a bad row is left out whole. */
export function parseSeedCsv(text: string): { rows: SeedRow[]; errors: string[] } {
  const [header, ...body] = parseCsv(text);
  const cols = (header ?? []).map((h) => h.trim());
  const missing = SEED_COLUMNS.filter((c) => !cols.includes(c));
  if (missing.length) return { rows: [], errors: [`The header row is missing ${missing.join(", ")}.`] };

  const rows: SeedRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (c: (typeof SEED_COLUMNS)[number]) => (cells[cols.indexOf(c)] ?? "").trim();
    const problems: string[] = [];
    const link = parseProductLink(get("productUrl"));
    const asin = link.ok && link.kind === "amazon" ? link.asin : null;
    if (!asin) problems.push("productUrl isn't an Amazon UK product link");
    const title = get("title");
    if (!title || title.length > 200) problems.push("title must be 1 to 200 characters");
    const imageUrl = get("imageUrl");
    if (imageUrl && !httpsUrl(imageUrl)) problems.push("imageUrl must be an https link (or blank)");
    const price = parseSupplierPrice(get("supplierPrice"));
    if (price === null || Number.isNaN(price)) problems.push("supplierPrice must be pounds per unit, like 2.49");
    const category = get("category");
    if (!CATEGORY.test(category)) problems.push('category must be a slug like "home-kitchen"');
    const supplierUrl = get("supplierUrl");
    if (!httpsUrl(supplierUrl)) problems.push("supplierUrl must be the https link the supplier price was read from");
    if (asin && seen.has(asin)) problems.push(`${asin} is already on an earlier line`);
    if (problems.length) return errors.push(`Line ${line}: ${problems.join("; ")}.`);
    seen.add(asin!);
    rows.push({
      line,
      asin: asin!,
      productUrl: `https://www.amazon.co.uk/dp/${asin}`,
      title,
      imageUrl: imageUrl || null,
      supplierPrice: price!,
      category,
      supplierUrl,
    });
  });
  return { rows, errors };
}

/** The supplier price as evidence: what the CSV says, citing the listing it was read from. */
export function supplierEvidence(row: SeedRow, now: Date): Evidence {
  return {
    id: `seed-csv:supplier:${row.asin}`,
    provider: "seed-csv",
    sourceType: "supplier",
    sourceUrl: row.supplierUrl,
    observedAt: now.toISOString(),
    publishedAt: null,
    quality: 50, // read by hand from the listing and typed into the CSV, not fetched
    claim: `Supplier price £${row.supplierPrice.toFixed(2)} a unit, as listed for UK delivery, read from this listing for the catalog seed`,
    value: row.supplierPrice,
  };
}

export type SeedVerdict = {
  verdict: QuickResult;
  supplier: Evidence;
  /** Why the product isn't added to the catalog: a brand-restricted product never is (Rule 7), nor a mismatched pair. */
  skip: string | null;
};

/** The product being sold, when it isn't the Amazon UK listing: the supplier listing's own title and stated brand. */
export type SoldProduct = { name: string; brand: string | null };

/**
 * The homepage check's verdict for one row: its Dossier's Amazon UK listings against the CSV's supplier
 * price, with the brand checks on `sold` (the AliExpress listing) when given, else on the Amazon listing.
 */
export function seedVerdict(row: SeedRow, d: Dossier, now: Date, sold: SoldProduct | null = null): SeedVerdict {
  const supplier = supplierEvidence(row, now);
  const flags = subjectFlags(d, sold);
  const verdict = quickVerdict(d, flags, { amount: row.supplierPrice, source: "you", evidence: supplier }, now);
  let skip: string | null = null;
  if (verdict.gate === "G3_BRAND") skip = `brand-restricted: ${flags.trademarkRisk.value ? flags.trademarkRisk.reason : flags.brandDirect.reason}`;
  else if (sold && titleSimilarity(sold.name, d.product.title) < LISTING_MATCH_MIN) {
    skip = `the supplier listing doesn't look like the same product as the Amazon UK one ("${d.product.title}")`;
  }
  return { verdict, supplier, skip };
}

/** A dedupe key for an evidence row, so a re-run with the same capture doesn't save it twice. */
export const evidenceHash = (e: Pick<Evidence, "sourceUrl" | "claim" | "observedAt">) =>
  createHash("sha256").update(`${e.sourceUrl}\n${e.claim}\n${e.observedAt}`).digest("hex");
