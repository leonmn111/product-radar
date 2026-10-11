import { describe, expect, it } from "vitest";
import { parseSearch, toCategorySlug } from "./search";

// Mirrors the SQL in searchProducts: a pattern must start a word.
const matches = (query: string, text: string) =>
  parseSearch(query).filter((t) =>
    t.patterns.some((p) => new RegExp(`(^|[^\\p{L}\\p{N}])${p}`, "u").test(text.toLowerCase())),
  );

describe("parseSearch", () => {
  it("splits plain words and slugs the same way, ignoring case", () => {
    expect(parseSearch("Wireless Earbuds").map((t) => t.word)).toEqual(["wireless", "earbuds"]);
    expect(parseSearch("wireless-earbuds").map((t) => t.word)).toEqual(["wireless", "earbuds"]);
  });

  it("finds singular and plural forms", () => {
    expect(matches("earbuds", "Our latest earbud")).toHaveLength(1);
    expect(matches("earbud", "true-wireless earbuds")).toHaveLength(1);
    expect(matches("accessories", "phone accessory")).toHaveLength(1);
    expect(matches("accessory", "tech-accessories")).toHaveLength(1);
    expect(matches("glasses", "reading glass")).toHaveLength(1);
    expect(matches("headphones", "over-ear headphone")).toHaveLength(1);
    expect(matches("iphone series", "hydrating serum")).toHaveLength(0);
  });

  it("keeps words ending in double s whole", () => {
    expect(parseSearch("wireless")[0].patterns).toEqual(["wireless"]);
  });

  it("finds British and American spellings", () => {
    expect(matches("moisturizer", "Bio-Active Ceramide Moisturiser")).toHaveLength(1);
    expect(matches("moisturiser", "oil-free moisturizer")).toHaveLength(1);
    expect(matches("noise cancelling", "active noise-canceling")).toHaveLength(2);
    expect(matches("canceling", "noise cancelling")).toHaveLength(1);
  });

  it("matches the start of a word, not the middle", () => {
    expect(matches("oven", "Clinically proven")).toHaveLength(0);
    expect(matches("oven", "pizza ovens")).toHaveLength(1);
    expect(matches("wireless", "true-wireless earbuds")).toHaveLength(1);
  });

  it("ignores accents in the query", () => {
    expect(matches("soufflé", "Banana Souffle Moisture Cream")).toHaveLength(1);
  });

  it("drops filler words and duplicates", () => {
    expect(parseSearch("the best products for a pizza oven, pizza").map((t) => t.word)).toEqual(["pizza", "oven"]);
    expect(parseSearch("best products")).toEqual([]);
    expect(parseSearch("  ")).toEqual([]);
  });

  it("counts the last word double, since it usually names the thing", () => {
    expect(parseSearch("wireless earbuds").map((t) => t.weight)).toEqual([1, 2]);
    expect(parseSearch("earbuds").map((t) => t.weight)).toEqual([1]);
  });

  it("keeps patterns to letters and digits, so they are safe inside LIKE", () => {
    for (const t of parseSearch("100% _cotton_ t-shirt 50%off \\ % _")) {
      for (const p of t.patterns) expect(p).toMatch(/^[\p{L}\p{N}]+$/u);
    }
  });
});

describe("toCategorySlug", () => {
  it("turns any spelling of a category into its slug", () => {
    expect(toCategorySlug("Tech Accessories")).toBe("tech-accessories");
    expect(toCategorySlug(" tech_accessories ")).toBe("tech-accessories");
    expect(toCategorySlug("BEAUTY")).toBe("beauty");
  });
});
