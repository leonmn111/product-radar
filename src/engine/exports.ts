// Exports (ARCHITECTURE.md › The product, part 8): a Dossier as files a seller can use. Pure.
//
// generateShopifyCSV(): the product as one draft listing in Shopify's product CSV import format. It's
// built only from shown parts of the Dossier (CLAUDE.md Rule 5): without a shown margin there's no
// sourced retail price, so there's nothing to export.

import type { Dossier } from "@/types/dossier";

/** Shopify's product import columns, in this order. */
export const SHOPIFY_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Variant Price",
  "Variant Compare At Price",
  "Image Src",
] as const;

export class ExportUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportUnavailableError";
  }
}

/** The Vendor on every export (owner, 2026-10-16): never the supplier, which shoppers can see in many themes. */
export const SHOPIFY_VENDOR = "ProductRadar Import";

/** Text from listings is untrusted: neutralise spreadsheet formulas, then quote (RFC 4180). */
function csvCell(v: string) {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "UGREEN Nexode 10000mAh …" → "ugreen-nexode-10000mah-…", at most 80 characters. */
export function shopifyHandle(title: string) {
  return (
    title
      .replace(/[™®©]/g, "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "") || "product"
  );
}

/**
 * The Dossier's product as a Shopify import file (header row and one product row, CRLF line ends).
 * - Variant Price: the Dossier's retail price (the median of the cited Amazon UK listings, VAT included).
 * - Vendor: "ProductRadar Import" (the seller renames it to their own brand).
 * - Image Src: the best supplier match's product image, when it lists one. Never an Amazon photo,
 *   and the body is only the title: the seller sources their own creative.
 * - Published FALSE: it imports as a draft, so nothing goes live until the seller reviews it.
 * - Compare-at price is empty: no RRP is captured, and none is invented.
 * Throws ExportUnavailableError when the margin (and so the price) is withheld.
 */
export function generateShopifyCSV(dossier: Dossier): string {
  if (dossier.landedMargin.status !== "shown") {
    throw new ExportUnavailableError(
      dossier.landedMargin.reason === "Not Sellable"
        ? "This product isn't sellable, so there's no listing to export."
        : "The margin is withheld (too little evidence), so there's no sourced retail price to export.",
    );
  }
  const price = dossier.landedMargin.value.uk.retailPrice;
  const supplier = dossier.supplierMatches[0];
  const title = dossier.product.title.trim();
  const row: Record<(typeof SHOPIFY_COLUMNS)[number], string> = {
    Handle: shopifyHandle(title),
    Title: title,
    "Body (HTML)": `<p>${escapeHtml(title)}</p>`,
    Vendor: SHOPIFY_VENDOR,
    Type: "",
    Tags: "ProductRadar",
    Published: "FALSE",
    // Shopify's own values for a product with a single variant.
    "Option1 Name": "Title",
    "Option1 Value": "Default Title",
    "Variant Price": price.amount.toFixed(2),
    "Variant Compare At Price": "",
    "Image Src": supplier?.image ?? "",
  };
  const line = (cells: readonly string[]) => cells.map(csvCell).join(",");
  return `${line(SHOPIFY_COLUMNS)}\r\n${line(SHOPIFY_COLUMNS.map((c) => row[c]))}\r\n`;
}
