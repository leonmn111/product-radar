import { describe, expect, it } from "vitest";
import { extractProduct, normaliseAvailability, normalisePrice } from "./extract";
import { FetchPageError, isPrivateAddress, parsePublicUrl, robotsAllows } from "./fetch-page";
import { slugify } from "./ingest";

const page = (head: string, body = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const URL_ = "https://shop.test/products/trail-runner";

describe("extractProduct", () => {
  it("reads a schema.org Product from JSON-LD including offer and rating", () => {
    const html = page(
      ld({
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Trail Runner 2",
        description: "Lightweight trail shoe.",
        brand: { "@type": "Brand", name: "Peak" },
        image: ["/img/a.jpg"],
        offers: { "@type": "Offer", price: "129.00", priceCurrency: "usd", availability: "https://schema.org/InStock" },
        aggregateRating: { "@type": "AggregateRating", ratingValue: "4.6", reviewCount: "212" },
      }) + `<title>Trail Runner 2 – Peak Store</title>`,
    );
    const x = extractProduct(html, URL_);
    expect(x.title).toEqual({ value: "Trail Runner 2", method: "json-ld" });
    expect(x.brand?.value).toBe("Peak");
    expect(x.imageUrl?.value).toBe("https://shop.test/img/a.jpg");
    expect(x.price).toEqual({ value: { amount: "129.00", currency: "USD", availability: "IN_STOCK" }, method: "json-ld" });
    expect(x.rating?.value).toEqual({ value: 4.6, best: 5 });
    expect(x.reviewCount?.value).toBe(212);
  });

  it("finds a Product inside @graph and AggregateOffer", () => {
    const html = page(
      ld({
        "@graph": [
          { "@type": "WebPage", name: "x" },
          { "@type": "Product", name: "Mug", offers: { "@type": "AggregateOffer", lowPrice: 12, priceCurrency: "EUR" } },
        ],
      }),
    );
    expect(extractProduct(html, URL_).price?.value).toEqual({ amount: "12.00", currency: "EUR", availability: "UNKNOWN" });
  });

  it("falls back to Open Graph product tags", () => {
    const html = page(`
      <meta property="og:title" content="Desk Lamp">
      <meta property="product:price:amount" content="1,299.50">
      <meta property="product:price:currency" content="GBP">
      <meta property="product:availability" content="out of stock">`);
    const x = extractProduct(html, URL_);
    expect(x.title?.method).toBe("open-graph");
    expect(x.price?.value).toEqual({ amount: "1299.50", currency: "GBP", availability: "OUT_OF_STOCK" });
  });

  it("never invents a price: no currency ⇒ no price; plain text prices are ignored", () => {
    const html = page(
      ld({ "@type": "Product", name: "Thing", offers: { price: "20.00" } }),
      `<p class="price">$19.99</p>`,
    );
    expect(extractProduct(html, URL_).price).toBeNull();
  });

  it("scales ratings published on a 10-point scale and rejects impossible ones", () => {
    const ten = page(ld({ "@type": "Product", name: "A", aggregateRating: { ratingValue: 8, bestRating: 10 } }));
    expect(extractProduct(ten, URL_).rating?.value).toEqual({ value: 8, best: 10 });
    const bad = page(ld({ "@type": "Product", name: "A", aggregateRating: { ratingValue: 7 } }));
    expect(extractProduct(bad, URL_).rating).toBeNull();
  });

  it("survives malformed JSON-LD and uses the next layer", () => {
    const html = page(`<script type="application/ld+json">{ not json</script><meta property="og:title" content="Fallback">`);
    expect(extractProduct(html, URL_).title).toEqual({ value: "Fallback", method: "open-graph" });
  });

  it("flags whether the page declares a product at all", () => {
    expect(extractProduct(page(ld({ "@type": "Product", name: "A" })), URL_).declaresProduct).toBe(true);
    expect(extractProduct(page(`<meta property="og:type" content="product">`), URL_).declaresProduct).toBe(true);
    // A homepage or bot-check page with only a title / og:title is not a product.
    const home = page(`<title>Best Shoes</title><meta property="og:title" content="Best Shoes"><meta property="og:type" content="website">`);
    expect(extractProduct(home, URL_).declaresProduct).toBe(false);
  });

  it("only trusts a canonical URL on the same site", () => {
    const same = page(`<link rel="canonical" href="https://www.shop.test/products/x">`);
    const other = page(`<link rel="canonical" href="https://evil.test/products/x">`);
    expect(extractProduct(same, URL_).canonicalUrl).toBe("https://www.shop.test/products/x");
    expect(extractProduct(other, URL_).canonicalUrl).toBeNull();
  });
});

describe("normalisers", () => {
  it("parses prices in common formats", () => {
    expect(normalisePrice("$49")).toBe("49.00");
    expect(normalisePrice("1.299,00")).toBe("1299.00");
    expect(normalisePrice(19.5)).toBe("19.50");
    expect(normalisePrice("free")).toBeNull();
  });
  it("maps availability", () => {
    expect(normaliseAvailability("https://schema.org/InStock")).toBe("IN_STOCK");
    expect(normaliseAvailability("http://schema.org/OutOfStock")).toBe("OUT_OF_STOCK");
    expect(normaliseAvailability("PreOrder")).toBe("PREORDER");
    expect(normaliseAvailability(undefined)).toBe("UNKNOWN");
  });
  it("slugifies titles to the database's slug format", () => {
    expect(slugify("Caffè  Uno — Lever (2024)!")).toBe("caffe-uno-lever-2024");
  });
});

describe("fetch safety", () => {
  it("flags private, loopback and link-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "151.101.1.69", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("rejects non-web, local and credentialed URLs", () => {
    for (const u of ["ftp://x.com/a", "file:///etc/passwd", "http://localhost/a", "http://printer.local/", "https://a:b@x.com/", "https://x.com:8080/"]) {
      expect(() => parsePublicUrl(u), u).toThrow(FetchPageError);
    }
    expect(parsePublicUrl("https://shop.test/p#reviews").toString()).toBe("https://shop.test/p");
    // Private IP literals must be refused before any request (incl. robots.txt) is made.
    for (const u of ["http://127.0.0.1/p", "http://[::1]/p", "http://169.254.169.254/latest", "http://0x7f000001/p", "http://10.0.0.5/"]) {
      expect(() => parsePublicUrl(u), u).toThrow(FetchPageError);
    }
  });

  it("applies robots.txt rules", () => {
    const robots = `User-agent: *\nDisallow: /checkout\nDisallow: /search\nAllow: /search/ok\n\nUser-agent: BadBot\nDisallow: /`;
    expect(robotsAllows(robots, "/products/x")).toBe(true);
    expect(robotsAllows(robots, "/checkout/1")).toBe(false);
    expect(robotsAllows(robots, "/search/ok")).toBe(true);
    expect(robotsAllows(`User-agent: ProductRadarBot\nDisallow: /`, "/products/x")).toBe(false);
    expect(robotsAllows(`User-agent: *\nDisallow: /*?variant=`, "/products/x?variant=2")).toBe(false);
  });
});
