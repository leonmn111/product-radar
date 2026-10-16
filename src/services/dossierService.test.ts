import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ImageMatcher } from "@/engine/imageMatch";
import type { RetailListing, SupplierOffer } from "@/server/live/types";
import { parseRainforestProduct, parseRainforestSearch } from "@/server/sources/rainforest/parse";
import type { RetailSource, SupplierSource } from "@/server/sources/types";
import type { FeeStack } from "@/types/financials";
import type { Dossier } from "@/types/dossier";
import type { DossierCacheStore } from "./dossierCache";
import { buildDossier, fetchDossierData, fetchProductDossierData, getProductDossier, type DossierInput } from "./dossierService";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "../server/sources/rainforest/fixtures", name), "utf8"));

const NOW = new Date("2026-10-16T12:00:00Z");
const ctx = { id: "test-dossier", now: NOW };
const MUG = "Plain White Ceramic Coffee Mug 350ml";

const listing = (n: number, price: number, title = MUG, currency = "GBP"): RetailListing => {
  const host = currency === "EUR" ? "www.amazon.de" : "www.amazon.co.uk";
  return {
    market: "GB",
    id: `B0MUG${n}`,
    title,
    url: `https://${host}/dp/B0MUG${n}`,
    image: null,
    price: { amount: price, currency },
    rating: null,
    ratingsTotal: null,
    sponsored: false,
    recentSales: null,
    evidence: {
      id: `rainforest:${host}:B0MUG${n}`,
      provider: "rainforest",
      sourceUrl: `https://${host}/dp/B0MUG${n}`,
      observedAt: NOW.toISOString(),
      quality: 90,
      claim: `Listed at ${price} ${currency}`,
    },
  };
};

const offer = (n: number, price: number, currency = "GBP", title = "Ceramic Coffee Mug 350ml White Plain"): SupplierOffer => ({
  id: `ae${currency}${n}`,
  title,
  url: `https://www.aliexpress.com/item/${currency}${n}.html`,
  image: null,
  unitPrice: { amount: price, currency },
  shipping: null,
  shipsTo: "GB",
  evidence: {
    id: `aliexpress:${currency}${n}`,
    provider: "aliexpress",
    sourceUrl: `https://www.aliexpress.com/item/${currency}${n}.html`,
    observedAt: NOW.toISOString(),
    quality: 80,
    claim: `Offered at ${price} ${currency}`,
  },
});

const strong: DossierInput = {
  query: "ceramic coffee mug",
  ukListings: [listing(1, 12.99), listing(2, 13.49), listing(3, 12.49), listing(4, 14.99)],
  suppliers: [offer(1, 2.1), offer(2, 2.4)],
};

describe("buildDossier", () => {
  it("shows the UK margin, saturation and verdict at 0.7+ confidence, each cited", () => {
    const d = buildDossier(strong, ctx);
    expect(d.verdict.confidence).toBeGreaterThanOrEqual(0.7);
    if (d.landedMargin.status !== "shown") throw new Error("margin should be shown");
    const uk = d.landedMargin.value.uk;
    expect(uk.currency).toBe("GBP");
    expect(uk.netProfit.amount).toBeGreaterThan(0);
    expect(uk.complete).toBe(false); // shipping isn't quoted, and it's named rather than guessed
    expect(uk.excluded.map((x) => x.kind)).toContain("shipping");
    expect(d.landedMargin.value.eu).toBeNull(); // no EU data was given
    expect(d.saturation).toMatchObject({ status: "shown", value: { sellerCount: 4, storeCount: 1, adDensity: null } });
    expect(d.momentum).toMatchObject({ status: "withheld", reason: "Insufficient Data" }); // no history yet
    expect(d.verdict).toMatchObject({ status: "shown", value: { kind: "TEST" } }); // incomplete costs → test first
    expect(d.supplierMatches).toHaveLength(2);
    // Every evidence id a number cites is in the evidence list (listings, suppliers and the fee rules).
    const ids = new Set(d.evidence.map((e) => e.id));
    for (const id of d.landedMargin.evidenceIds) expect(ids).toContain(id);
  });

  it("works out an EU margin only from EUR listings and EUR supplier prices", () => {
    const amazonDE: FeeStack = {
      channel: "custom",
      name: "Test EU channel",
      fees: [{ kind: "percent", label: "Referral fee", rate: 0.15, base: "price_inc_vat", basis: "caller_supplied", evidenceIds: [] }],
    };
    const euListings = [listing(11, 15.99, MUG, "EUR"), listing(12, 16.49, MUG, "EUR")];
    const gbpOnly = buildDossier({ ...strong, eu: { country: "DE", listings: euListings, suppliers: [offer(9, 2.2)], feeStack: amazonDE } }, ctx);
    if (gbpOnly.landedMargin.status !== "shown") throw new Error("margin should be shown");
    expect(gbpOnly.landedMargin.value.eu).toBeNull(); // GBP supplier prices are never used for the EU

    const withEur = buildDossier({ ...strong, eu: { country: "DE", listings: euListings, suppliers: [offer(9, 2.5, "EUR")], feeStack: amazonDE } }, ctx);
    if (withEur.landedMargin.status !== "shown") throw new Error("margin should be shown");
    expect(withEur.landedMargin.value.eu).toMatchObject({ currency: "EUR", country: "DE" });
  });

  it("halts the financials for a product that isn't sellable, with the reasons", () => {
    const powerBank = "Magnetic Power Bank 10000mAh for MagSafe";
    const d = buildDossier({ ...strong, ukListings: [1, 2, 3, 4].map((n) => listing(n, 24.99, powerBank)), suppliers: [offer(1, 6, "GBP", powerBank)] }, ctx);
    expect(d.resellability.batteries.value).toBe(true);
    expect(d.resellability.trademarkRisk.value).toBe(true);
    expect(d.landedMargin).toMatchObject({ status: "withheld", reason: "Not Sellable" });
    if (d.landedMargin.status !== "withheld") throw new Error("unreachable");
    expect(d.landedMargin.missing).toEqual(expect.arrayContaining(["batteries is tripped", "trademarkRisk is tripped"]));
    expect(d.verdict).toMatchObject({ status: "shown", value: { kind: "AVOID" } });
    expect(d.evidence.some((e) => e.provider !== "rainforest" && e.provider !== "aliexpress")).toBe(false); // no fee rules cited
  });

  it("shows the verdict but no numbers between 0.5 and 0.7", () => {
    const d = buildDossier({ ...strong, ukListings: strong.ukListings.slice(0, 2), suppliers: [offer(1, 2.1)] }, ctx);
    expect(d.verdict.confidence).toBeGreaterThanOrEqual(0.5);
    expect(d.verdict.confidence).toBeLessThan(0.7);
    expect(d.verdict).toMatchObject({ status: "shown", value: { kind: "TEST" } });
    for (const part of [d.landedMargin, d.saturation, d.momentum]) expect(part).toMatchObject({ status: "withheld", reason: "Insufficient Data" });
  });

  it("withholds the verdict too below 0.5, and says what evidence is missing", () => {
    const d = buildDossier({ ...strong, ukListings: [listing(1, 12.99)], suppliers: [] }, ctx);
    expect(d.verdict.confidence).toBeLessThan(0.5);
    expect(d.verdict).toMatchObject({ status: "withheld", reason: "Insufficient Data" });
    if (d.verdict.status !== "withheld") throw new Error("unreachable");
    expect(d.verdict.missing).toEqual(expect.arrayContaining([expect.stringContaining("Amazon UK listings"), "a supplier listing that matches this product"]));
  });

  it("leaves out supplier offers that don't match the product or aren't in GBP", () => {
    const d = buildDossier({ ...strong, suppliers: [offer(1, 2.1), offer(2, 9, "GBP", "Stainless Steel Travel Flask"), offer(3, 2, "USD")] }, ctx);
    expect(d.supplierMatches.map((m) => m.listingUrl)).toEqual(["https://www.aliexpress.com/item/GBP1.html"]);
    expect(d.notes.join(" ")).toContain("weren't priced in GBP");
  });
});

describe("buildDossier: image matching", () => {
  // Two listings and two suppliers whose titles match only partly: below the financial gate on titles alone.
  const withImages: DossierInput = {
    query: "ceramic coffee mug",
    ukListings: [1, 2].map((n) => ({ ...listing(n, 12.99), image: `https://m.media-amazon.com/images/I/mug${n}.jpg` })),
    suppliers: [1, 2].map((n) => ({ ...offer(n, 2.2, "GBP", "Coffee Cup 350ml Ceramic Large"), image: `https://ae01.alicdn.com/kf/cup${n}.jpg` })),
    sample: true,
  };
  const fixedMatcher = (score: number): ImageMatcher => ({ method: "simulated", compare: () => score });

  it("lets a high image similarity lift confidence past 0.7, so the numbers show", () => {
    const titlesOnly = buildDossier(withImages, ctx);
    expect(titlesOnly.landedMargin.confidence).toBeLessThan(0.7);
    expect(titlesOnly.landedMargin.status).toBe("withheld");

    const d = buildDossier(withImages, { ...ctx, imageMatcher: fixedMatcher(0.95) });
    expect(d.landedMargin.confidence).toBeGreaterThanOrEqual(0.7);
    expect(d.landedMargin.status).toBe("shown");
    const supplierEvidence = d.evidence.filter((e) => e.sourceType === "supplier");
    expect(supplierEvidence[0].imageMatch).toEqual({ score: 0.95, method: "simulated", comparedWith: "rainforest:www.amazon.co.uk:B0MUG1" });
    expect(d.supplierMatches[0]?.matchScore).toBeGreaterThan(0.95); // 1 − (1 − title)(1 − 0.95)
    expect(d.notes.join(" ")).toContain("SIMULATED");
  });

  it("refuses a simulated image score on anything but development sample data", () => {
    expect(() => buildDossier({ ...withImages, sample: false }, { ...ctx, imageMatcher: fixedMatcher(0.95) })).toThrow(/sample data only/);
  });
});

describe("buildDossier: one product by ASIN", () => {
  it("is about the requested product even when another product has more listings", () => {
    const toothbrush = { ...listing(9, 6.49, "Bamboo Toothbrush Set of 4 Biodegradable"), id: "B0BRUSH001" };
    const d = buildDossier({ query: "B0BRUSH001", productId: "B0BRUSH001", ukListings: [toothbrush, ...strong.ukListings], suppliers: [] }, ctx);
    expect(d.product).toMatchObject({ title: "Bamboo Toothbrush Set of 4 Biodegradable", identifiers: { asin: "B0BRUSH001" } });
  });
});

describe("fetchDossierData", () => {
  const supplier: SupplierSource = { name: "supplier", search: vi.fn(async () => []) };

  it("searches a synonym when too few listings agree, within the 3-call budget", async () => {
    const retail: RetailSource = {
      name: "retail",
      search: vi.fn(async (term: string) => [listing(term === "earbuds" ? 1 : 2, 19.99, "Wireless Earbuds Bluetooth 5.3 Headphones")]),
      product: vi.fn(async () => null),
    };
    const data = await fetchDossierData("earbuds", { retail, supplier });
    expect(vi.mocked(retail.search).mock.calls.map((c) => c[0])).toEqual(["earbuds", "wireless earbuds"]);
    expect(data.ukListings).toHaveLength(2);
    expect(data.notes?.join(" ")).toContain('also searched for "wireless earbuds"');
    expect(supplier.search).toHaveBeenCalled(); // the budget kept a call for the supplier
  });

  it("doesn't spend on synonyms when the first search already corroborates the product", async () => {
    const retail: RetailSource = { name: "retail", search: vi.fn(async () => strong.ukListings.map((l) => ({ ...l, title: "Wireless Earbuds Bluetooth 5.3" }))), product: vi.fn(async () => null) };
    await fetchDossierData("earbuds", { retail, supplier });
    expect(retail.search).toHaveBeenCalledTimes(1);
  });

  it("asks the supplier source for the best-corroborated product, and keeps a supplier failure as a note", async () => {
    const retail: RetailSource = { name: "retail", search: vi.fn(async () => strong.ukListings), product: vi.fn(async () => null) };
    const supplier: SupplierSource = {
      name: "supplier",
      search: vi.fn(async () => {
        throw new Error("rate limited");
      }),
    };
    const data = await fetchDossierData("ceramic coffee mug", { retail, supplier });
    expect(retail.search).toHaveBeenCalledWith("ceramic coffee mug", "GB", expect.anything());
    expect(supplier.search).toHaveBeenCalledWith(expect.stringContaining("mug"), "GB", expect.anything());
    expect(data.ukListings).toHaveLength(4);
    expect(data.suppliers).toEqual([]);
    expect(data.notes?.[0]).toContain("rate limited");
  });
});

describe("fetchProductDossierData (real recorded Amazon UK responses)", () => {
  const page = parseRainforestProduct(fixture("product-amazon-co-uk-B0CH33F5P2-recorded.json"), "GB", NOW);
  const search = parseRainforestSearch(fixture("search-amazon-co-uk-recorded.json"), "GB", NOW);

  it("reads the product page, finds other listings of it, and checks it with its real brand and seller", async () => {
    const retail: RetailSource = { name: "retail", search: vi.fn(async () => search), product: vi.fn(async () => page) };
    const supplier: SupplierSource = { name: "supplier", search: vi.fn(async () => []) };
    const data = await fetchProductDossierData("B0CH33F5P2", { retail, supplier });
    expect(retail.product).toHaveBeenCalledWith("B0CH33F5P2", "GB", expect.anything());
    expect(data?.ukListings[0].evidence.id).toBe("rainforest:amazon.co.uk:B0CH33F5P2:page"); // the page, not the search result
    expect(data?.ukListings.filter((l) => l.id === "B0CH33F5P2")).toHaveLength(1);

    const d = buildDossier(data!, ctx);
    expect(d.product.identifiers.asin).toBe("B0CH33F5P2");
    expect(d.resellability.brandDirect).toMatchObject({ value: true, evidenceIds: ["rainforest:amazon.co.uk:B0CH33F5P2:page"] });
    expect(d.resellability.brandDirect.reason).toContain('the seller "UGREEN GROUP LIMITED UK" is the brand "UGREEN"');
    expect(d.landedMargin).toMatchObject({ status: "withheld", reason: "Not Sellable" });
  });

  it("is null when Amazon UK has no such product, after one call", async () => {
    const retail: RetailSource = { name: "retail", search: vi.fn(async () => []), product: vi.fn(async () => null) };
    expect(await fetchProductDossierData("B0NOTHERE1", { retail, supplier: { name: "s", search: vi.fn(async () => []) } })).toBeNull();
    expect(retail.search).not.toHaveBeenCalled();
  });
});

describe("getProductDossier (the 48-hour cache)", () => {
  const page = parseRainforestProduct(fixture("product-amazon-co-uk-B0CH33F5P2-recorded.json"), "GB", NOW);
  const memoryCache = () => {
    const rows = new Map<string, Dossier>();
    const store: DossierCacheStore & { rows: typeof rows } = {
      rows,
      get: vi.fn(async (id: string) => rows.get(id) ?? null),
      put: vi.fn(async (d: Dossier) => void rows.set(d.product.identifiers.asin!, d)),
    };
    return store;
  };
  const sources = () => ({
    retail: { name: "retail", search: vi.fn(async () => []), product: vi.fn(async () => page) } satisfies RetailSource,
    supplier: { name: "supplier", search: vi.fn(async () => []) } satisfies SupplierSource,
  });

  it("builds and caches on a miss, then serves the cached copy without calling any provider", async () => {
    const cache = memoryCache();
    const first = sources();
    const miss = await getProductDossier("B0CH33F5P2", { sources: first, cache, sample: false, id: "buyer-1", now: () => NOW });
    expect(miss?.cache).toBe("miss");
    expect(first.retail.product).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledWith(miss?.dossier, NOW);

    const second = sources();
    const hit = await getProductDossier("B0CH33F5P2", { sources: second, cache, sample: false, id: "buyer-2", now: () => NOW });
    expect(hit?.cache).toBe("hit");
    expect([second.retail.product, second.retail.search, second.supplier.search].map((f) => f.mock.calls.length)).toEqual([0, 0, 0]);
    // The buyer's own copy: its id, the same evidence and time, and a note that it came from the cache.
    expect(hit?.dossier).toMatchObject({ id: "buyer-2", generatedAt: miss?.dossier.generatedAt, verdict: miss?.dossier.verdict });
    expect(hit?.dossier.notes.at(-1)).toContain("From the 48-hour cache");
  });

  it("never serves sample data to a real request, or the other way round", async () => {
    const cache = memoryCache();
    await getProductDossier("B0CH33F5P2", { sources: sources(), cache, sample: true, id: "dev", now: () => NOW });
    const real = sources();
    expect((await getProductDossier("B0CH33F5P2", { sources: real, cache, sample: false, id: "prod", now: () => NOW }))?.cache).toBe("miss");
    expect(real.retail.product).toHaveBeenCalled();
  });

  it("still answers when the cache can't be written, and finds nothing for an unknown product", async () => {
    const cache = memoryCache();
    vi.mocked(cache.put).mockRejectedValueOnce(new Error("db down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await getProductDossier("B0CH33F5P2", { sources: sources(), cache, sample: false, id: "x", now: () => NOW }))?.cache).toBe("miss");
    quiet.mockRestore();
    const none = sources();
    none.retail.product.mockResolvedValueOnce(null);
    expect(await getProductDossier("B0NOTHERE1", { sources: none, cache, sample: false, id: "y", now: () => NOW })).toBeNull();
  });
});
