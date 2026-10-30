import { describe, expect, it, vi } from "vitest";
import { FINANCIAL_THRESHOLD } from "@/engine/confidence";
import { UK_VAT_EVIDENCE } from "@/engine/policy";
import type { SupplierOffer } from "@/server/live/types";
import type { SupplierSource } from "@/server/sources/types";
import { BRAND_RESTRICTED_MARGIN, buildCatalogMargin, getCatalogMargin, memorySupplierCache, type CatalogProduct } from "./catalogMargin";

const now = new Date("2026-10-24T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

let n = 0;
const offer = (merchant: string, amount: number, over: Partial<CatalogProduct["offers"][number]> = {}): CatalogProduct["offers"][number] => {
  const id = `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`;
  return {
    id,
    merchant,
    url: `https://${merchant}/p/utensils`,
    price: { amount: amount.toFixed(2), currency: "GBP" },
    availability: "IN_STOCK",
    observedAt: hoursAgo(24),
    sourceEvidenceId: id,
    source: { quality: 90, type: "RETAILER", claim: `£${amount.toFixed(2)} at ${merchant}` },
    rrp: null,
    ...over,
  };
};

const unbranded = (offers: CatalogProduct["offers"]): CatalogProduct => ({
  name: "Silicone Kitchen Utensil Set 12 Piece",
  brand: null,
  category: "kitchen",
  description: "Heat resistant silicone spatula, ladle and spoon set.",
  offers,
});
const fourStores = () => [offer("a.test", 19.99), offer("b.test", 21.99), offer("c.test", 24.99), offer("d.test", 22.49)];

const supplierOffer = (id: string, title: string, amount: number, currency = "GBP"): SupplierOffer => ({
  id,
  title,
  url: `https://www.aliexpress.com/item/${id}.html`,
  image: null,
  unitPrice: { amount, currency },
  shipping: null,
  shipsTo: "GB",
  evidence: {
    id: `aliexpress:${id}:GB`,
    provider: "aliexpress",
    sourceUrl: `https://www.aliexpress.com/item/${id}.html`,
    observedAt: hoursAgo(1),
    quality: 85,
    claim: `"${title}": ${amount.toFixed(2)} ${currency} on AliExpress, ships to GB`,
  },
});
const matching = [
  supplierOffer("1001", "12 Pcs Silicone Kitchen Utensil Set Heat Resistant Cooking Tools", 3.5),
  supplierOffer("1002", "Silicone Kitchen Utensil Set 12 pieces with holder", 4.2),
  supplierOffer("1003", "Kitchen Utensil Set Silicone 12 Pcs Non-stick", 3.1),
  supplierOffer("1004", "Stainless Steel Garlic Press", 1.2),
  supplierOffer("1005", "Silicone Kitchen Utensil Set 12 Piece", 2.9, "USD"),
];

const source = (search: SupplierSource["search"]): SupplierSource & { search: ReturnType<typeof vi.fn> } => ({ name: "aliexpress", search: vi.fn(search) });

describe("catalog landed margin: the gates", () => {
  it("G3: never searches suppliers for a branded (High IP Risk) product, so it has no supplier links and no margin", async () => {
    const supplier = source(async () => matching);
    const p = { ...unbranded(fourStores()), name: "KitchenPro Silicone Kitchen Utensil Set 12 Piece", brand: "KitchenPro" };
    const r = await getCatalogMargin(p, { supplier, now: () => now, cache: memorySupplierCache() });
    expect(r.resellability.trademarkRisk.value).toBe(true);
    expect(supplier.search).not.toHaveBeenCalled();
    expect(r.margin).toMatchObject({ status: "withheld", reason: "Not Sellable", missing: [BRAND_RESTRICTED_MARGIN] });
    expect(r.supplierMatches).toEqual([]);
    expect(JSON.stringify(r)).not.toMatch(/aliexpress/i);
    // The UK price still reaches the calculator.
    expect(r.retail).toMatchObject({ price: 22.24, stores: 4 });
  });

  it("G3: the INKEY moisturiser gets no supplier search, whatever the suppliers would have offered", () => {
    const cream = { ...unbranded(fourStores()), name: "The INKEY List Bio-Active Ceramide Moisturiser", brand: "The INKEY List UK", category: "beauty" };
    const offers = [supplierOffer("3001", "Ceramide Barrier Moisturizer Panthenol Hyaluronic Acid", 2.13), supplierOffer("3002", "Bio-Active Ceramide Moisturiser", 2.73)];
    const r = buildCatalogMargin(cream, { status: "found", offers }, now);
    expect(r.margin.status === "withheld" && r.margin.reason).toBe("Not Sellable");
    expect(r.supplierMatches).toEqual([]);
    expect(r.evidence.every((e) => e.sourceType !== "supplier")).toBe(true);
  });

  it("keeps exact matching for a regulated but unbranded product (Compliance Gated)", () => {
    const p = { ...unbranded(fourStores()), name: "Silicone Kitchen Utensil Set 12 Piece with USB Charger" };
    const r = buildCatalogMargin(p, { status: "found", offers: matching }, now);
    expect(r.resellability.requiresUKCA.value).toBe(true);
    // The utensil sets don't carry "USB charger": under the strict 80% rule they aren't this product.
    expect(r.margin.status === "withheld" && r.margin.missing[0]).toMatch(/^No exact supplier match found/);
  });

  it("needs a current UK price in GBP and converts nothing", () => {
    const p = unbranded([offer("us.test", 24, { price: { amount: "24.00", currency: "USD" } })]);
    const r = buildCatalogMargin(p, null, now);
    expect(r.margin).toMatchObject({ status: "withheld", reason: "Insufficient Data" });
    expect(r.margin.status === "withheld" && r.margin.missing[0]).toMatch(/GBP .*USD; nothing is converted/);
  });

  it("ignores a store's capture that is older than 30 days or sold out", () => {
    const p = unbranded([offer("old.test", 10, { observedAt: new Date(now.getTime() - 31 * 86_400_000).toISOString() }), offer("gone.test", 11, { availability: "OUT_OF_STOCK" })]);
    const r = buildCatalogMargin(p, null, now);
    expect(r.retailOffers).toEqual([]);
    expect(r.margin.status === "withheld" && r.margin.missing[0]).toMatch(/current in-stock store price/);
  });

  it("says so when the supplier source isn't connected", async () => {
    const r = await getCatalogMargin(unbranded(fourStores()), { supplier: null, now: () => now });
    expect(r.margin.status === "withheld" && r.margin.missing[0]).toMatch(/AliExpress connection isn't set up/);
  });

  it("never reads a failed supplier search as 'no supplier', and doesn't cache it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cache = memorySupplierCache();
    const supplier = source(async () => {
      throw new Error("aliexpress: IllegalAccessToken");
    });
    const r = await getCatalogMargin(unbranded(fourStores()), { supplier, now: () => now, cache });
    expect(r.margin).toMatchObject({ status: "withheld", reason: "Insufficient Data" });
    expect(r.margin.status === "withheld" && r.margin.missing[0]).toMatch(/supplier search failed just now/);
    expect(JSON.stringify(r)).not.toMatch(/IllegalAccessToken/); // provider errors stay in the server log
    await getCatalogMargin(unbranded(fourStores()), { supplier, now: () => now, cache });
    expect(supplier.search).toHaveBeenCalledTimes(2);
  });

  it("withholds when no supplier listing matches the product", () => {
    const r = buildCatalogMargin(unbranded(fourStores()), { status: "found", offers: [matching[3]] }, now);
    expect(r.margin.status === "withheld" && r.margin.missing[0]).toMatch(/^No exact supplier match found: none of the 1 AliExpress listings carries at least 80%/);
  });

  it("withholds below the 0.7 numbers gate and names the evidence it needs", () => {
    const p = unbranded([offer("solo.test", 22, { source: { quality: 60, type: "RETAILER", claim: "£22.00 at solo.test" } })]);
    const r = buildCatalogMargin(p, { status: "found", offers: [matching[0]] }, now);
    expect(r.margin.status).toBe("withheld");
    expect(r.margin.confidence).toBeLessThan(FINANCIAL_THRESHOLD);
    expect(r.margin.status === "withheld" && r.margin.missing).toEqual(["more current UK store prices (1 found)", "more or closer supplier matches (1 found)"]);
    expect(JSON.stringify(r.margin)).not.toMatch(/netProfit/);
  });
});

describe("catalog landed margin: the waterfall", () => {
  it("prices the UK margin from the median store price and the median matched supplier price", () => {
    const r = buildCatalogMargin(unbranded(fourStores()), { status: "found", offers: matching }, now);
    expect(r.margin.status).toBe("shown");
    if (r.margin.status !== "shown") return;
    const m = r.margin.value;
    // Retail: median of 19.99, 21.99, 22.49, 24.99 = 22.24. Supplier: median of the three GBP matches 3.10, 3.50, 4.20 = 3.50.
    expect(m.retailPrice).toEqual({ amount: 22.24, currency: "GBP" });
    const line = (kind: string) => m.lines.filter((l) => l.kind === kind).map((l) => l.amount.amount);
    expect(line("supplier")).toEqual([3.5]);
    // VAT inside £22.24 at 20%: 22.24 − 22.24 / 1.2 = 3.71. TikTok Shop UK: 9% and 15% of £18.53, plus £0.50.
    expect(line("vat")).toEqual([3.71]);
    expect(line("platform_fee")).toEqual([1.67, 0.5, 2.78]);
    expect(m.netProfit.amount).toBe(10.08);
    expect(m.channel).toBe("tiktok_shop_uk");
    expect(m.excluded.map((x) => x.kind)).toEqual(["shipping", "returns", "ad_cost"]);
    // The garlic press doesn't match and the USD offer isn't converted: the three GBP matches remain.
    expect(r.supplierMatches.map((s) => s.url).sort()).toEqual(matching.slice(0, 3).map((o) => o.url).sort());
    expect(r.supplierMatches.every((s) => s.matchScore >= 0.5)).toBe(true);
    expect(r.supplierMatches.map((s) => s.unitPrice).sort()).toEqual([3.1, 3.5, 4.2]);
  });

  it("cites every price it used and the tax rules behind the VAT line", () => {
    const r = buildCatalogMargin(unbranded(fourStores()), { status: "found", offers: matching }, now);
    const ids = new Set(r.evidence.map((e) => e.id));
    expect(r.retailOffers).toHaveLength(4);
    for (const o of r.retailOffers) expect(ids.has(o.evidenceId)).toBe(true);
    for (const s of r.supplierMatches) expect(ids.has(s.evidenceId)).toBe(true);
    expect(ids.has(UK_VAT_EVIDENCE.id)).toBe(true);
    if (r.margin.status === "shown") for (const id of r.margin.evidenceIds) expect(ids.has(id)).toBe(true);
  });

  it("asks the supplier once per search term and serves repeats from the cache", async () => {
    const cache = memorySupplierCache();
    const supplier = source(async () => matching);
    const deps = { supplier, cache, now: () => now };
    const product = unbranded(fourStores());
    const first = await getCatalogMargin(product, deps);
    const second = await getCatalogMargin(product, deps);
    expect(supplier.search).toHaveBeenCalledOnce();
    expect(supplier.search.mock.calls[0][0]).toBe("silicone kitchen utensil 12");
    expect(supplier.search.mock.calls[0][1]).toBe("GB");
    expect(first.margin.status).toBe("shown");
    expect(second.margin).toEqual(first.margin);
  });

  it("asks again once the cached supplier prices are a day old", async () => {
    let clock = now;
    const cache = memorySupplierCache();
    const supplier = source(async () => matching);
    await getCatalogMargin(unbranded(fourStores()), { supplier, cache, now: () => clock });
    clock = new Date(now.getTime() + 24 * 3_600_000);
    await getCatalogMargin(unbranded(fourStores()), { supplier, cache, now: () => clock });
    expect(supplier.search).toHaveBeenCalledTimes(2);
  });
});
