import { describe, expect, it } from "vitest";
import { parseAmazonUkLink } from "./amazonLink";

const asin = (input: string) => {
  const r = parseAmazonUkLink(input);
  return r.ok ? r.asin : r.reason;
};

describe("parseAmazonUkLink", () => {
  it("reads the ASIN from every amazon.co.uk product link shape, and from a bare ASIN", () => {
    expect(asin("https://www.amazon.co.uk/Anker-Magnetic-Wireless-Portable-Charger/dp/B0CH33F5P2/ref=sr_1_3?keywords=power+bank")).toBe("B0CH33F5P2");
    expect(asin("amazon.co.uk/dp/b0ch33f5p2")).toBe("B0CH33F5P2");
    expect(asin("https://www.amazon.co.uk/gp/product/B0CH33F5P2?th=1")).toBe("B0CH33F5P2");
    expect(asin("https://www.amazon.co.uk/gp/aw/d/B0CH33F5P2")).toBe("B0CH33F5P2");
    expect(asin("https://m.amazon.co.uk/dp/B0CH33F5P2#reviews")).toBe("B0CH33F5P2");
    expect(asin("https://www.amazon.co.uk/product-reviews/B0CH33F5P2/")).toBe("B0CH33F5P2");
    expect(asin("  B0CH33F5P2  ")).toBe("B0CH33F5P2");
    expect(asin("0141036141")).toBe("0141036141"); // a book's ISBN-10 is its ASIN
  });

  it("explains what it can't read, without fetching anything", () => {
    expect(asin("")).toBe("empty");
    expect(asin("https://amzn.eu/d/abc123")).toBe("short_link");
    expect(asin("https://www.amazon.com/dp/B0CH33F5P2")).toBe("other_amazon");
    expect(asin("https://www.amazon.de/dp/B0CH33F5P2")).toBe("other_amazon");
    expect(asin("https://www.tiktok.com/view/product/1729384756")).toBe("not_amazon");
    expect(asin("https://www.aliexpress.com/item/1005010414755062.html")).toBe("not_amazon");
    expect(asin("https://www.amazon.co.uk/s?k=coffee+mug")).toBe("no_asin");
    expect(asin("https://evil.example/amazon.co.uk/dp/B0CH33F5P2")).toBe("not_amazon");
    expect(asin("not a link at all")).toBe("not_amazon");
  });
});
