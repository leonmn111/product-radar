import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ImageMatcher } from "@/engine/imageMatch";
import type { RetailListing, RetailProductDetail, SupplierOffer } from "@/server/live/types";
import { parseKeepaHistory } from "@/server/sources/keepa";
import type { KeepaProductResponse } from "@/server/sources/keepa/types";
import { simulatedAdSource, type AdDurationSource } from "@/server/sources/metaAds";
import { parseRainforestProduct, parseRainforestSearch } from "@/server/sources/rainforest/parse";
import { SourceError, type HistorySource, type RetailSource, type SupplierSource } from "@/server/sources/types";
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
    expect(d.verdict.missing).toEqual(expect.arrayContaining([expect.stringContaining("Amazon UK listings"), expect.stringMatching(/^an exact supplier match \(no exact supplier match found/)]));
  });

  it("leaves out supplier offers that don't match the product or aren't in GBP", () => {
    const d = buildDossier({ ...strong, suppliers: [offer(1, 2.1), offer(2, 9, "GBP", "Stainless Steel Travel Flask"), offer(3, 2, "USD")] }, ctx);
    expect(d.supplierMatches.map((m) => m.listingUrl)).toEqual(["https://www.aliexpress.com/item/GBP1.html"]);
    expect(d.notes.join(" ")).toContain("weren't priced in GBP");
  });
});

describe("buildDossier: image matching", () => {
  // Two listings, and two suppliers whose titles carry only half the mug's key words.
  const withImages: DossierInput = {
    query: "ceramic coffee mug",
    ukListings: [1, 2].map((n) => ({ ...listing(n, 12.99), image: `https://m.media-amazon.com/images/I/mug${n}.jpg` })),
    suppliers: [1, 2].map((n) => ({ ...offer(n, 2.2, "GBP", "Coffee Cup 350ml Ceramic Large"), image: `https://ae01.alicdn.com/kf/cup${n}.jpg` })),
    sample: true,
  };
  const fixedMatcher = (score: number): ImageMatcher => ({ method: "simulated", compare: () => score });

  it("never lets an image make up for a supplier title that isn't an exact match", () => {
    // "Coffee Cup 350ml Ceramic Large" carries 3 of the mug's 6 key words: 50%, under the 80% bar.
    const d = buildDossier(withImages, { ...ctx, imageMatcher: fixedMatcher(0.95) });
    expect(d.supplierMatches).toEqual([]);
    expect(d.landedMargin.status).toBe("withheld");
    expect(d.landedMargin.status === "withheld" && d.landedMargin.missing.join(" ")).toMatch(/no exact supplier match found/i);
  });

  it("adds a matching image to an exact title match's score and confidence", () => {
    // 5 of the mug's 6 key words (no "plain"): 83%, an exact match on its title alone.
    const exact: DossierInput = {
      ...withImages,
      suppliers: [1, 2].map((n) => ({ ...offer(n, 2.2, "GBP", "Ceramic Coffee Mug 350ml White"), image: `https://ae01.alicdn.com/kf/cup${n}.jpg` })),
    };
    const titlesOnly = buildDossier(exact, ctx);
    const d = buildDossier(exact, { ...ctx, imageMatcher: fixedMatcher(0.95) });
    expect(titlesOnly.supplierMatches[0]?.matchScore).toBe(0.833);
    expect(d.landedMargin.confidence).toBeGreaterThan(titlesOnly.landedMargin.confidence);
    const supplierEvidence = d.evidence.filter((e) => e.sourceType === "supplier");
    expect(supplierEvidence[0].imageMatch).toEqual({ score: 0.95, method: "simulated", comparedWith: "rainforest:www.amazon.co.uk:B0MUG1" });
    expect(d.supplierMatches[0]?.matchScore).toBeGreaterThan(0.95); // 1 − (1 − 0.833)(1 − 0.95)
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

  it("asks the supplier source for the best-corroborated product", async () => {
    const retail: RetailSource = { name: "retail", search: vi.fn(async () => strong.ukListings), product: vi.fn(async () => null) };
    const supplier: SupplierSource = { name: "supplier", search: vi.fn(async () => [offer(1, 2.1)]) };
    const data = await fetchDossierData("ceramic coffee mug", { retail, supplier });
    expect(retail.search).toHaveBeenCalledWith("ceramic coffee mug", "GB", expect.anything());
    expect(supplier.search).toHaveBeenCalledWith(expect.stringContaining("mug"), "GB", expect.anything());
    expect(data.ukListings).toHaveLength(4);
    expect(data.suppliers).toHaveLength(1);
  });

  it("never turns a supplier failure into 'no supplier' (which would read as AVOID): it throws", async () => {
    const retail: RetailSource = { name: "retail", search: vi.fn(async () => strong.ukListings), product: vi.fn(async () => null) };
    for (const failure of [
      new SourceError("aliexpress", "The specified access token is invalid or expired"),
      new SourceError("aliexpress", "network error"),
      new SourceError("aliexpress", "App call limited"),
    ]) {
      const supplier: SupplierSource = { name: "aliexpress", search: vi.fn(async () => Promise.reject(failure)) };
      await expect(fetchDossierData("ceramic coffee mug", { retail, supplier })).rejects.toBe(failure);
      await expect(fetchProductDossierData("B0MUGPAGE1", { retail: { ...retail, product: vi.fn(async () => ({ listing: listing(1, 12.99), brand: null, sellerName: null, soldByAmazon: false, category: null, bulletPoints: [], description: null })) }, supplier })).rejects.toBe(failure);
    }
    // A search that works and finds nothing is the only "no supplier".
    const empty = await fetchDossierData("ceramic coffee mug", { retail, supplier: { name: "aliexpress", search: vi.fn(async () => []) } });
    expect(empty.suppliers).toEqual([]);
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

describe("getProductDossier: Momentum from Keepa (and simulated ads, sample data only)", () => {
  const keepaSample = JSON.parse(readFileSync(join(__dirname, "../server/sources/keepa/fixtures/SAMPLE-not-real-product-GB.json"), "utf8")) as KeepaProductResponse;
  const mugPage = (): RetailProductDetail => ({ listing: { ...listing(1, 12.99), id: "B0MUGPAGE1" }, brand: null, sellerName: "Mug Traders Ltd", soldByAmazon: false, category: null, bulletPoints: [], description: null });
  const history = (asin: string) => parseKeepaHistory({ ...keepaSample, products: keepaSample.products!.map((p) => ({ ...p, asin })) }, asin, NOW)!;
  const deps = (over: Partial<{ listings: RetailListing[]; history: HistorySource | null; ads: AdDurationSource | null; sample: boolean }> = {}) => {
    const historySource = over.history === undefined ? ({ name: "keepa (test)", history: vi.fn(async (a: string) => history(a)) } satisfies HistorySource) : over.history;
    return {
      sources: {
        retail: { name: "retail", product: vi.fn(async () => mugPage()), search: vi.fn(async () => over.listings ?? [2, 3, 4].map((n) => listing(n, 13.49))) } satisfies RetailSource,
        supplier: { name: "supplier", search: vi.fn(async () => [offer(1, 2.1), offer(2, 2.4)]) } satisfies SupplierSource,
        history: historySource,
        ads: over.ads ?? null,
      },
      cache: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
      sample: over.sample ?? false,
      id: "buyer",
      now: () => NOW,
    };
  };

  it("asks Keepa once the evidence clears 0.7, and shows a real slope and direction", async () => {
    const d = deps();
    const r = await getProductDossier("B0MUGPAGE1", d);
    expect(d.sources.history?.history).toHaveBeenCalledWith("B0MUGPAGE1", expect.anything());
    const m = r!.dossier.momentum;
    if (m.status !== "shown") throw new Error(JSON.stringify(m));
    expect(m.value.trendDirection).toBe("ACCELERATING"); // the sample's rank falls about 52 places a day
    expect(m.value.trendSlope12w).toBeLessThan(0);
    expect(m.value.adDurationDays).toBeNull(); // no ad source on real data
    expect(m.evidenceIds).toContain("keepa:2:B0MUGPAGE1");
    expect(r!.dossier.evidence.map((e) => e.id)).toContain("keepa:2:B0MUGPAGE1");
    expect(r!.dossier.exports.shopifyCsvUrl).toBe("/api/agent/v2/dossier/B0MUGPAGE1/export/csv");
  });

  it("doesn't spend on Keepa below 0.7 or for a product that isn't sellable", async () => {
    const thin = deps({ listings: [] });
    const r = await getProductDossier("B0MUGPAGE1", { ...thin, sources: { ...thin.sources, supplier: { name: "s", search: vi.fn(async () => []) } } });
    expect(thin.sources.history?.history).not.toHaveBeenCalled();
    expect(r!.dossier.momentum.status).toBe("withheld");

    const branded = deps();
    branded.sources.retail.product.mockResolvedValue({ ...mugPage(), brand: "Mugco" });
    await getProductDossier("B0MUGPAGE1", branded);
    expect(branded.sources.history?.history).not.toHaveBeenCalled();
  });

  it("says Keepa isn't connected when there's no key, and keeps a Keepa failure as a note", async () => {
    const none = await getProductDossier("B0MUGPAGE1", deps({ history: null }));
    expect(none!.dossier.momentum).toMatchObject({ status: "withheld", missing: ["90 days of sales-rank history (Keepa isn't connected)"] });
    const failing = deps({ history: { name: "keepa", history: vi.fn(async () => Promise.reject(new SourceError("keepa", "out of tokens"))) } });
    const r = await getProductDossier("B0MUGPAGE1", failing);
    expect(r!.dossier.momentum.status).toBe("withheld");
    expect(r!.dossier.notes.join(" ")).toContain("keepa: out of tokens");
    // Momentum doesn't feed the verdict, so the Dossier stands; but that copy isn't cached for 48 hours.
    expect(r!.dossier.verdict.status === "shown" && r!.dossier.verdict.value.kind).not.toBe("AVOID");
    expect(failing.cache.put).not.toHaveBeenCalled();
    const ok = deps();
    await getProductDossier("B0MUGPAGE1", ok);
    expect(ok.cache.put).toHaveBeenCalledOnce();
  });

  it("adds a simulated ad duration only on sample data, and labels it", async () => {
    const real = await getProductDossier("B0MUGPAGE1", deps({ ads: simulatedAdSource }));
    expect(real!.dossier.momentum.status === "shown" && real!.dossier.momentum.value.adDurationDays).toBeNull();
    const sample = await getProductDossier("B0MUGPAGE1", deps({ ads: simulatedAdSource, sample: true }));
    const m = sample!.dossier.momentum;
    if (m.status !== "shown") throw new Error("momentum should be shown");
    expect(m.value.adDurationMethod).toBe("simulated");
    expect(m.value.adDurationDays).toBeGreaterThanOrEqual(0);
    expect(sample!.dossier.notes.join(" ")).toContain("Ad duration is SIMULATED");
  });
});
