import { describe, expect, it, vi } from "vitest";
import type { RetailListing, SupplierOffer } from "@/server/live/types";
import type { RetailSource, SupplierSource } from "@/server/sources/types";
import type { FeeStack } from "@/types/financials";
import { buildDossier, fetchDossierData, type DossierInput } from "./dossierService";

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

describe("fetchDossierData", () => {
  it("asks the supplier source for the best-corroborated product, and keeps a supplier failure as a note", async () => {
    const retail: RetailSource = { name: "retail", search: vi.fn(async () => strong.ukListings) };
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
