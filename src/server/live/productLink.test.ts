import { describe, expect, it } from "vitest";
import { parseProductLink } from "./productLink";

describe("parseProductLink", () => {
  it("reads an Amazon UK link or a bare ASIN", () => {
    expect(parseProductLink("https://www.amazon.co.uk/dp/B0CH33F5P2?th=1")).toEqual({ ok: true, kind: "amazon", asin: "B0CH33F5P2" });
    expect(parseProductLink("b0ch33f5p2")).toEqual({ ok: true, kind: "amazon", asin: "B0CH33F5P2" });
  });

  it("reads an AliExpress product link on any of its domains", () => {
    for (const link of [
      "https://www.aliexpress.com/item/1005010414755062.html?spm=a2g0o.productlist",
      "aliexpress.com/item/1005010414755062.html",
      "https://m.aliexpress.com/item/1005010414755062.html",
      "https://www.aliexpress.us/item/1005010414755062.html",
      "https://fr.aliexpress.com/i/1005010414755062.html",
    ]) {
      expect(parseProductLink(link)).toEqual({ ok: true, kind: "aliexpress", productId: "1005010414755062" });
    }
  });

  it("reads the product name out of a TikTok Shop link, without fetching the page", () => {
    expect(parseProductLink("https://www.tiktok.com/shop/pdp/silicone-kitchen-utensil-set-12-piece/1729483920123456789?source=ecommerce")).toEqual({
      ok: true,
      kind: "tiktok",
      name: "silicone kitchen utensil set 12 piece",
      productId: "1729483920123456789",
    });
    expect(parseProductLink("https://shop.tiktok.com/uk/pdp/led-sunset-lamp%20projector/1729483920123456790")).toMatchObject({ ok: true, name: "led sunset lamp projector" });
  });

  it("asks for the full link, or one with a name, when it can't tell which product", () => {
    const message = (link: string) => {
      const r = parseProductLink(link);
      return r.ok ? null : r.message;
    };
    expect(message("https://vm.tiktok.com/ZGeAbCdEf/")).toMatch(/short TikTok link/);
    expect(message("https://shop.tiktok.com/view/product/1729483920123456789?region=GB")).toMatch(/doesn't include the product's name/);
    expect(message("https://www.tiktok.com/@someone/video/7300000000000000000")).toMatch(/isn't a TikTok Shop product/);
    expect(message("https://a.aliexpress.com/_mKxYz12")).toMatch(/short AliExpress link/);
    expect(message("https://www.aliexpress.com/store/1105216648")).toMatch(/doesn't point at one product/);
    expect(message("https://amzn.eu/d/abc123")).toMatch(/short link/);
    expect(message("https://www.amazon.com/dp/B0CH33F5P2")).toMatch(/Amazon UK/);
    expect(message("https://www.ebay.co.uk/itm/123")).toBe("Paste a TikTok Shop, Amazon UK or AliExpress product link.");
    expect(message("   ")).toBe("Paste a TikTok Shop, Amazon UK or AliExpress product link.");
  });
});
