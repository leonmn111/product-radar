import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { QueryBudget } from "@/server/live/budget";
import { SourceError } from "../types";
import { createRainforestSource } from "./index";
import { parseRainforestProduct, parseRainforestSearch, RAINFOREST_QUALITY } from "./parse";

const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures/search-amazon-co-uk.json"), "utf8"));
const recorded = JSON.parse(readFileSync(join(__dirname, "fixtures/search-amazon-co-uk-recorded.json"), "utf8"));
const recordedProduct = JSON.parse(readFileSync(join(__dirname, "fixtures/product-amazon-co-uk-B0CH33F5P2-recorded.json"), "utf8"));
const fallback = new Date("2026-10-15T12:00:00.000Z");

describe("parseRainforestSearch", () => {
  const listings = parseRainforestSearch(fixture, "GB", fallback);

  it("keeps priced listings in the market's currency, and drops the rest", () => {
    // The USD-priced and the unpriced listing are dropped: nothing is converted or guessed.
    expect(listings.map((l) => l.id)).toEqual(["B0TESTAAA1", "B0TESTAAA2"]);
  });

  it("reads the selling price, never the RRP, with its evidence", () => {
    expect(listings[0]).toMatchObject({
      market: "GB",
      title: "Magnetic Power Bank 10000mAh Wireless Portable Charger, 20W PD Fast Charging",
      url: "https://www.amazon.co.uk/dp/B0TESTAAA1",
      price: { amount: 21.99, currency: "GBP" },
      rating: 4.4,
      ratingsTotal: 2311,
      sponsored: true,
      recentSales: "1K+ bought in past month",
      evidence: {
        id: "rainforest:amazon.co.uk:B0TESTAAA1",
        provider: "rainforest",
        sourceUrl: "https://www.amazon.co.uk/dp/B0TESTAAA1",
        observedAt: "2026-10-15T09:00:11.000Z",
        quality: RAINFOREST_QUALITY,
      },
    });
    expect(listings[0].evidence.claim).toContain("£21.99 on Amazon UK, rated 4.4/5 from 2,311 ratings, 1K+ bought in past month");
  });
});

describe("a real recorded Rainforest response (amazon.co.uk, 2026-10-15)", () => {
  it("parses every listing, in GBP, with its evidence", () => {
    const listings = parseRainforestSearch(recorded, "GB", fallback);
    expect(listings).toHaveLength(recorded.search_results.length);
    expect(listings.every((l) => l.price.currency === "GBP" && l.evidence.sourceUrl.startsWith("https://www.amazon.co.uk/"))).toBe(true);
    // This response carries no sponsored flags: absent means not sponsored, never guessed.
    expect(listings.some((l) => l.sponsored)).toBe(false);
  });
});

describe("parseRainforestProduct: a real recorded product page (amazon.co.uk, B0CH33F5P2, 2026-10-16)", () => {
  const detail = parseRainforestProduct(recordedProduct, "GB", fallback);

  it("reads the buy-box price (never the RRP) as a cited listing", () => {
    expect(detail?.listing).toMatchObject({
      market: "GB",
      id: "B0CH33F5P2",
      title: "UGREEN Nexode 10000mAh MagSafe Wireless Power Bank PD 20W Fast Charging",
      price: { amount: 17.97, currency: "GBP" }, // the RRP on the page is £24.99
      image: "https://m.media-amazon.com/images/I/516Z4HFBZUL.jpg",
      evidence: { id: "rainforest:amazon.co.uk:B0CH33F5P2:page", provider: "rainforest", observedAt: "2026-10-16T11:19:48.241Z", quality: RAINFOREST_QUALITY },
    });
    expect(detail?.listing.evidence.claim).toContain("£17.97 in the buy box on Amazon UK, sold by UGREEN GROUP LIMITED UK, brand UGREEN");
  });

  it("reads what the resellability checks need: brand, seller, category, bullet points", () => {
    expect(detail).toMatchObject({ brand: "UGREEN", sellerName: "UGREEN GROUP LIMITED UK", soldByAmazon: false });
    expect(detail?.category).toBe("Electronics & Photo > Mobile Phones & Communication > Accessories > Chargers > Portable Power Banks");
    expect(detail?.bulletPoints).toHaveLength(5);
  });

  it("gives nothing for a page without a product or a price in the market's currency", () => {
    expect(parseRainforestProduct({ request_info: { success: true } }, "GB", fallback)).toBeNull();
    expect(parseRainforestProduct(recordedProduct, "US", fallback)).toBeNull(); // GBP price, US market
  });
});

describe("createRainforestSource", () => {
  const budget = () => new QueryBudget({ maxCalls: 5, deadlineMs: 30_000 });

  it("asks Rainforest for the market's Amazon domain and spends one call", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => (url ? Response.json(fixture) : Response.error()));
    const b = budget();
    const listings = await createRainforestSource({ apiKey: "k", fetchImpl: fetchImpl as typeof fetch }).search("power bank", "GB", b);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect([url.origin + url.pathname, url.searchParams.get("type"), url.searchParams.get("amazon_domain"), url.searchParams.get("search_term")]).toEqual([
      "https://api.rainforestapi.com/request",
      "search",
      "amazon.co.uk",
      "power bank",
    ]);
    expect(listings).toHaveLength(2);
    expect(b.callsUsed).toBe(1);
  });

  it("looks up one product page by ASIN for one call", async () => {
    const fetchImpl = vi.fn(async () => Response.json(recordedProduct));
    const b = budget();
    const detail = await createRainforestSource({ apiKey: "k", fetchImpl: fetchImpl as typeof fetch }).product("B0CH33F5P2", "GB", b);
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect([url.searchParams.get("type"), url.searchParams.get("amazon_domain"), url.searchParams.get("asin")]).toEqual(["product", "amazon.co.uk", "B0CH33F5P2"]);
    expect(detail?.listing.id).toBe("B0CH33F5P2");
    expect(b.callsUsed).toBe(1);
  });

  it("turns a refusal into a SourceError with Rainforest's own message", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ request_info: { success: false, message: "Invalid API key" } }, { status: 401 }));
    await expect(createRainforestSource({ apiKey: "bad", fetchImpl: fetchImpl as typeof fetch }).search("x", "US", budget())).rejects.toEqual(
      new SourceError("rainforest", "Invalid API key"),
    );
  });
});
