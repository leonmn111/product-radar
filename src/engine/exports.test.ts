import { describe, expect, it } from "vitest";
import type { RetailListing, SupplierOffer } from "@/server/live/types";
import { buildDossier } from "@/services/dossierService";
import type { Dossier } from "@/types/dossier";
import { ExportUnavailableError, generateShopifyCSV, SHOPIFY_COLUMNS, shopifyHandle } from "./exports";

const NOW = new Date("2026-10-16T12:00:00Z");
const listing = (n: number, price: number, title = "Plain White Ceramic Coffee Mug 350ml"): RetailListing => ({
  market: "GB",
  id: `B0MUG000${n}`,
  title,
  url: `https://www.amazon.co.uk/dp/B0MUG000${n}`,
  image: null,
  price: { amount: price, currency: "GBP" },
  rating: null,
  ratingsTotal: null,
  sponsored: false,
  recentSales: null,
  evidence: { id: `rainforest:amazon.co.uk:B0MUG000${n}`, provider: "rainforest", sourceUrl: `https://www.amazon.co.uk/dp/B0MUG000${n}`, observedAt: NOW.toISOString(), quality: 90, claim: "listed" },
});
const offer = (n: number, image: string | null = `https://ae01.alicdn.com/kf/mug${n}.jpg`): SupplierOffer => ({
  id: `ae${n}`,
  title: "Ceramic Coffee Mug 350ml White Plain",
  url: `https://www.aliexpress.com/item/${n}.html`,
  image,
  unitPrice: { amount: 2.1, currency: "GBP" },
  shipping: null,
  shipsTo: "GB",
  evidence: { id: `aliexpress:${n}`, provider: "aliexpress", sourceUrl: `https://www.aliexpress.com/item/${n}.html`, observedAt: NOW.toISOString(), quality: 80, claim: "offered" },
});
const build = (listings: RetailListing[], offers: SupplierOffer[]): Dossier => buildDossier({ query: "mug", ukListings: listings, suppliers: offers }, { id: "d1", now: NOW });
/** Parses the two-line file back into column → value. */
function parse(csv: string) {
  const [head, row] = csv.trimEnd().split("\r\n").map((l) => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"')));
  return { head, cells: Object.fromEntries(head.map((h, i) => [h, row[i]])) as Record<string, string> };
}

describe("generateShopifyCSV", () => {
  const strong = build([listing(1, 12.99), listing(2, 13.49), listing(3, 12.49), listing(4, 14.99)], [offer(1), offer(2)]);

  it("writes Shopify's columns, in order, and one draft product", () => {
    const { head, cells } = parse(generateShopifyCSV(strong));
    expect(head).toEqual([...SHOPIFY_COLUMNS]);
    expect(cells).toEqual({
      Handle: "plain-white-ceramic-coffee-mug-350ml",
      Title: "Plain White Ceramic Coffee Mug 350ml",
      "Body (HTML)": "<p>Plain White Ceramic Coffee Mug 350ml</p>",
      Vendor: "ProductRadar Import",
      Type: "",
      Tags: "ProductRadar",
      Published: "FALSE",
      "Option1 Name": "Title",
      "Option1 Value": "Default Title",
      "Variant Price": "13.24", // the margin's retail price: the median of the four listings
      "Variant Compare At Price": "", // no RRP captured, none invented
      "Image Src": "https://ae01.alicdn.com/kf/mug1.jpg",
    });
    expect(strong.landedMargin.status === "shown" && strong.landedMargin.value.uk.retailPrice.amount).toBe(13.24);
  });

  it("quotes every cell, escapes HTML, and neutralises spreadsheet formulas in listing text", () => {
    const sneaky = { ...strong, product: { ...strong.product, title: '=HYPERLINK("x") Mug, "350ml" <b>' } };
    const csv = generateShopifyCSV(sneaky);
    const { cells } = parse(csv);
    expect(cells.Title).toBe(`'=HYPERLINK("x") Mug, "350ml" <b>`);
    expect(cells["Body (HTML)"]).toBe("<p>=HYPERLINK(&quot;x&quot;) Mug, &quot;350ml&quot; &lt;b&gt;</p>");
    expect(csv.split("\r\n")).toHaveLength(3); // header, row, and the final line ending
  });

  it("refuses to export without a shown margin: too little evidence, or not sellable", () => {
    expect(() => generateShopifyCSV(build([listing(1, 12.99)], []))).toThrow(ExportUnavailableError);
    const branded = build([1, 2, 3, 4].map((n) => listing(n, 24.99, "Magnetic Power Bank 10000mAh for MagSafe")), []);
    expect(() => generateShopifyCSV(branded)).toThrow("isn't sellable");
  });

  it("makes a clean handle", () => {
    expect(shopifyHandle("UGREEN® Nexode 10000mAh — 20W!")).toBe("ugreen-nexode-10000mah-20w");
    expect(shopifyHandle("™")).toBe("product");
  });
});
