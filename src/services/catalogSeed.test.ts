import { describe, expect, it } from "vitest";
import { checkResellability } from "@/engine/compliance";
import type { Dossier, Evidence } from "@/types/dossier";
import { evidenceHash, parseCsv, parseSeedCsv, seedVerdict, type SeedRow } from "./catalogSeed";

const NOW = new Date("2026-11-02T12:00:00.000Z");
const HEADER = "productUrl,title,imageUrl,supplierPrice,category,supplierUrl";

describe("parseCsv", () => {
  it("reads quoted commas, doubled quotes, CRLF line ends and a byte-order mark, and drops blank lines", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\nz,\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["z", ""],
    ]);
  });
});

describe("parseSeedCsv", () => {
  it("keeps a good row, with the canonical Amazon UK address", () => {
    const csv = `${HEADER}\nhttps://www.amazon.co.uk/Silicone-Mat/dp/B0ABCDE123?th=1,"Silicone Baking Mat, 2 Pack",https://m.media-amazon.com/images/I/x.jpg,£2.49,home-kitchen,https://www.aliexpress.com/item/1005001.html\n`;
    const { rows, errors } = parseSeedCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        asin: "B0ABCDE123",
        productUrl: "https://www.amazon.co.uk/dp/B0ABCDE123",
        title: "Silicone Baking Mat, 2 Pack",
        imageUrl: "https://m.media-amazon.com/images/I/x.jpg",
        supplierPrice: 2.49,
        category: "home-kitchen",
        supplierUrl: "https://www.aliexpress.com/item/1005001.html",
      },
    ]);
  });

  it("refuses a bad row whole, saying why, and a repeated product", () => {
    const good = "https://www.amazon.co.uk/dp/B0ABCDE123,Mat,,2.49,home-kitchen,https://www.aliexpress.com/item/1.html";
    const csv = [HEADER, good, "https://example.com/x,,ftp://img,free,Home Kitchen,", good].join("\n");
    const { rows, errors } = parseSeedCsv(csv);
    expect(rows.map((r) => r.line)).toEqual([2]);
    expect(errors[0]).toBe(
      'Line 3: productUrl isn\'t an Amazon UK product link; title must be 1 to 200 characters; imageUrl must be an https link (or blank); supplierPrice must be pounds per unit, like 2.49; category must be a slug like "home-kitchen"; supplierUrl must be the https link the supplier price was read from.',
    );
    expect(errors[1]).toBe("Line 4: B0ABCDE123 is already on an earlier line.");
  });

  it("needs every column in the header", () => {
    expect(parseSeedCsv("productUrl,title\n").errors).toEqual(["The header row is missing imageUrl, supplierPrice, category, supplierUrl."]);
  });
});

describe("seedVerdict", () => {
  const listing = (n: number, price: number): Evidence => ({
    id: `rainforest:amazon.co.uk:B0MAT0000${n}`,
    provider: "rainforest",
    sourceType: "marketplace",
    sourceUrl: `https://www.amazon.co.uk/dp/B0MAT0000${n}`,
    observedAt: NOW.toISOString(),
    publishedAt: null,
    quality: 90,
    claim: `Listed at £${price.toFixed(2)}`,
    value: price,
  });
  const dossier = (resellability = checkResellability({ title: "Silicone Baking Mat 2 Pack", brand: "Generic", market: "UK" })) =>
    ({
      product: { title: "Silicone Baking Mat 2 Pack", identifiers: { asin: "B0MAT00001" } },
      evidence: [19.99, 21.99, 22.49, 24.99].map((p, i) => listing(i + 1, p)), // median £22.24
      resellability,
      supplierMatches: [],
    }) as unknown as Dossier;
  const row = (supplierPrice: number): SeedRow => ({
    line: 2,
    asin: "B0MAT00001",
    productUrl: "https://www.amazon.co.uk/dp/B0MAT00001",
    title: "Silicone Baking Mat 2 Pack",
    imageUrl: null,
    supplierPrice,
    category: "home-kitchen",
    supplierUrl: "https://www.aliexpress.com/item/1005001.html",
  });

  it("gives the homepage check's verdict, with the supplier price as cited evidence", () => {
    const launch = seedVerdict(row(2), dossier(), NOW);
    expect([launch.verdict.tier, launch.skip]).toEqual(["LAUNCH", null]);
    expect(launch.verdict.margin?.lines.find((l) => l.kind === "supplier")?.evidenceIds).toEqual(["seed-csv:supplier:B0MAT00001"]);
    expect(launch.supplier).toMatchObject({ sourceUrl: "https://www.aliexpress.com/item/1005001.html", value: 2, sourceType: "supplier" });
    expect(seedVerdict(row(3.5), dossier(), NOW).verdict.tier).toBe("TEST");
    expect(seedVerdict(row(30), dossier(), NOW).verdict).toMatchObject({ tier: "AVOID", gate: "G1_PROFIT" });
  });

  it("skips a brand-restricted product, saying why", () => {
    const branded = checkResellability({ title: "Silpat Premium Baking Mat", brand: "Silpat", market: "UK" });
    const s = seedVerdict(row(2), dossier(branded), NOW);
    expect([s.verdict.label, s.skip]).toEqual(["Avoid (brand-restricted)", 'brand-restricted: the product is sold under the brand "Silpat"']);
  });

  it("with an AliExpress listing: checks the brand on what's sold, and needs the two titles to match", () => {
    // A branded Amazon listing, but the seller sells the unbranded AliExpress product: priced, not G3.
    const amazonBranded = checkResellability({ title: "Sopito Silicone Baking Mat 2 Pack", brand: "Sopito", market: "UK" });
    const sold = { name: "Silicone Baking Mat 2 Pack Reusable Non Stick", brand: null };
    expect(seedVerdict(row(2), dossier(amazonBranded), NOW, sold)).toMatchObject({ verdict: { tier: "LAUNCH" }, skip: null });
    // A branded AliExpress listing is brand-restricted.
    const s = seedVerdict(row(2), dossier(), NOW, { name: "Silpat Silicone Baking Mat 2 Pack", brand: "Silpat" });
    expect(s.skip).toBe('brand-restricted: the product is sold under the brand "Silpat"');
    // A different product isn't priced against this listing.
    expect(seedVerdict(row(2), dossier(), NOW, { name: "Stainless Steel Garlic Press", brand: null }).skip).toMatch(/doesn't look like the same product/);
  });

  it("hashes a capture the same way every time", () => {
    const e = listing(1, 19.99);
    expect(evidenceHash(e)).toBe(evidenceHash({ ...e }));
    expect(evidenceHash(e)).not.toBe(evidenceHash({ ...e, claim: "Listed at £20.00" }));
  });
});
