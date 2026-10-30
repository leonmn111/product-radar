import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkResellability } from "@/engine/compliance";
import { SourceError } from "@/server/sources/types";
import type { Dossier, Evidence } from "@/types/dossier";
import type { QuickCheck } from "@/types/quickCheck";

const SECRET = "a-test-secret-that-is-at-least-32-chars";
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env: { FREE_VERDICTS_PER_DAY: 2, FREE_VERDICTS_PER_VISITOR: 3, AUTH_SECRET: "a-test-secret-that-is-at-least-32-chars" } }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/server/auth/password", () => ({ clientAddress: (h: Headers) => h.get("x-forwarded-for") }));
vi.mock("@/server/live/config", () => ({ liveSources: vi.fn() }));
vi.mock("@/services/dossierCache", () => ({ dbDossierCache: { get: vi.fn(), put: vi.fn() } }));
vi.mock("@/services/dossierService", () => ({ getProductDossier: vi.fn(), searchProducts: vi.fn() }));
vi.mock("@/services/freeVerdicts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/freeVerdicts")>()),
  dbFreeVerdictQuota: { reserve: vi.fn(), release: vi.fn() },
}));

const { liveSources } = await import("@/server/live/config");
const { dbDossierCache } = await import("@/services/dossierCache");
const { getProductDossier, searchProducts } = await import("@/services/dossierService");
const { dbFreeVerdictQuota } = await import("@/services/freeVerdicts");
const { verifyUnlock } = await import("@/server/live/quickToken");
const { POST } = await import("./route");

const AMAZON = "https://www.amazon.co.uk/Utensil-Set/dp/B0MUG00001/ref=sr_1_1";
const ALIEXPRESS = "https://www.aliexpress.com/item/1005010414755062.html";
const TIKTOK = "https://www.tiktok.com/shop/pdp/silicone-kitchen-utensil-set-12-piece/1729483920123456789";
let ip = 0;
const call = (link: unknown, supplierPrice: unknown = "3.50", from = `203.0.113.${++ip}`) =>
  POST(new NextRequest("http://localhost/api/free-verdict", { method: "POST", body: JSON.stringify({ link, supplierPrice }), headers: { "x-forwarded-for": from } }));

const listing = (n: number, price: number): Evidence => ({
  id: `rainforest:amazon.co.uk:B0MUG0000${n}`,
  provider: "rainforest",
  sourceType: "marketplace",
  sourceUrl: `https://www.amazon.co.uk/dp/B0MUG0000${n}`,
  observedAt: new Date().toISOString(),
  publishedAt: null,
  quality: 90,
  claim: `Listed at £${price.toFixed(2)}`,
  value: price,
});
const dossier = (prices: number[], brand?: string): Dossier =>
  ({
    product: { title: "Silicone Kitchen Utensil Set 12 Piece", query: "B0MUG00001", market: "UK", country: "GB", currency: "GBP", identifiers: { asin: "B0MUG00001" } },
    evidence: prices.map((p, i) => listing(i + 1, p)),
    resellability: checkResellability({ title: "Silicone Kitchen Utensil Set 12 Piece", brand: brand ?? null, market: "UK" }),
    supplierMatches: [],
    sample: false,
  }) as unknown as Dossier;
const FOUR = [19.99, 21.99, 22.49, 24.99];
const supplierProduct = vi.fn();

beforeEach(() => {
  vi.mocked(liveSources).mockReturnValue({ ready: true, sample: false, sources: { retail: {}, supplier: { product: supplierProduct } } as never });
  vi.mocked(dbDossierCache.get).mockResolvedValue(null);
  vi.mocked(dbFreeVerdictQuota.reserve).mockReset().mockResolvedValue(true);
  vi.mocked(dbFreeVerdictQuota.release).mockReset().mockResolvedValue();
  vi.mocked(getProductDossier).mockReset().mockResolvedValue({ dossier: dossier(FOUR), cache: "miss" });
  vi.mocked(searchProducts).mockReset().mockResolvedValue({ results: [{ asin: "B0MUG00001", title: "Silicone Kitchen Utensil Set, 12 Piece Heat Resistant" }] as never, notes: [] });
  supplierProduct.mockReset();
});

describe("POST /api/free-verdict: the quick verdict", () => {
  it("gives the pill and what you keep per sale for an Amazon UK link and your supplier price, and a signed unlock", async () => {
    const res = await call(AMAZON, "£3.50");
    expect(res.status).toBe(200);
    const body = (await res.json()) as QuickCheck;
    expect(body).toMatchObject({
      link: "amazon",
      product: { asin: "B0MUG00001", url: "https://www.amazon.co.uk/dp/B0MUG00001" },
      pastedName: null,
      verdict: { tier: "TEST", gate: null, label: "Test small" },
      keepPerSale: 10.08,
      sellingPrice: 22.24,
      supplierPrice: { amount: 3.5, source: "you" },
      fromCache: false,
      fullDossier: "/signin?tab=register&callbackUrl=%2Fterminal%3Fasin%3DB0MUG00001",
    });
    // The breakdown's lines stay behind the email gate.
    expect(JSON.stringify(body)).not.toMatch(/VAT|referral|Creator/);
    expect(verifyUnlock(body.unlockToken!, SECRET, new Date())).toMatchObject({ asin: "B0MUG00001", link: "amazon", supplier: { amount: 3.5, source: "you" } });
    expect(dbFreeVerdictQuota.reserve).toHaveBeenCalledWith(expect.any(Date), 2);
  });

  it("G1: says it loses money before ads, with what it loses per sale", async () => {
    vi.mocked(getProductDossier).mockResolvedValue({ dossier: dossier([10, 10, 10, 10]), cache: "miss" });
    const body = (await (await call(AMAZON, "9")).json()) as QuickCheck;
    expect(body).toMatchObject({ verdict: { tier: "AVOID", gate: "G1_PROFIT", label: "Avoid" }, keepPerSale: -3.17, reason: "Loses £3.17 per sale before ads." });
  });

  it("G3: a branded Amazon product is Avoid (brand-restricted), with no figure and nothing to unlock", async () => {
    vi.mocked(getProductDossier).mockResolvedValue({ dossier: dossier(FOUR, "Anker"), cache: "miss" });
    const body = (await (await call(AMAZON)).json()) as QuickCheck;
    expect(body).toMatchObject({ verdict: { tier: "AVOID", gate: "G3_BRAND", label: "Avoid (brand-restricted)" }, keepPerSale: null, unlockToken: null });
  });

  it("says Not enough evidence, with no figure, when too few listings confirm the UK price", async () => {
    vi.mocked(getProductDossier).mockResolvedValue({ dossier: dossier([22.24]), cache: "miss" });
    const body = (await (await call(AMAZON)).json()) as QuickCheck;
    expect(body).toMatchObject({ verdict: { tier: "WITHHELD", label: "Not enough evidence" }, keepPerSale: null, unlockToken: null });
    expect(body.missing[0]).toMatch(/1 found/);
  });

  it("reads an AliExpress link with AliExpress's API, prices it at the listing when you give no price, and checks the listing itself", async () => {
    supplierProduct.mockResolvedValue({
      id: "1005010414755062",
      title: "Silicone Kitchen Utensil Set 12 Piece Non-stick Cooking Tools",
      url: ALIEXPRESS,
      unitPrice: { amount: 3.08, currency: "GBP" },
      brand: null,
      evidence: { id: "aliexpress:1005010414755062:GB", provider: "aliexpress", sourceUrl: ALIEXPRESS, observedAt: new Date().toISOString(), quality: 85, claim: "from 3.08 GBP" },
    });
    // The Amazon match is branded; what's being sold, the AliExpress listing, isn't.
    vi.mocked(getProductDossier).mockResolvedValue({ dossier: dossier(FOUR, "KitchenPro"), cache: "miss" });
    const body = (await (await call(ALIEXPRESS, "")).json()) as QuickCheck;
    expect(supplierProduct).toHaveBeenCalledWith("1005010414755062", "GB", expect.anything());
    expect(searchProducts).toHaveBeenCalledWith("silicone kitchen utensil 12 non stick cooking tools", expect.anything(), expect.anything());
    expect(body).toMatchObject({
      link: "aliexpress",
      pastedName: "Silicone Kitchen Utensil Set 12 Piece Non-stick Cooking Tools",
      verdict: { tier: "TEST" },
      supplierPrice: { amount: 3.08, source: "aliexpress_link" },
    });
  });

  it("reads a TikTok Shop link's product name, finds it on Amazon UK, and says so when it can't", async () => {
    expect(((await (await call(TIKTOK)).json()) as QuickCheck).pastedName).toBe("silicone kitchen utensil set 12 piece");
    vi.mocked(searchProducts).mockResolvedValue({ results: [{ asin: "B0OTHER001", title: "Garden Hose 30m Expandable" }] as never, notes: [] });
    const res = await call(TIKTOK, "3.50", "198.51.100.20");
    expect([res.status, (await res.json()).error]).toEqual([404, "no_product"]);
    expect(dbFreeVerdictQuota.release).toHaveBeenCalled(); // the visitor's check and the slot come back
  });

  it("refuses what it can't read, before anything is spent", async () => {
    for (const [link, price] of [["", "3"], ["https://vm.tiktok.com/ZGabc/", "3"], ["https://amzn.eu/d/abc", "3"], [AMAZON, "free"], [42, "3"]] as const) {
      const res = await call(link, price);
      expect(res.status).toBe(400);
    }
    expect(dbFreeVerdictQuota.reserve).not.toHaveBeenCalled();
    expect(getProductDossier).not.toHaveBeenCalled();
  });

  it(`allows each visitor ${3} free checks a day`, async () => {
    for (let i = 0; i < 3; i++) expect((await call(AMAZON, "3.50", "198.51.100.7")).status).toBe(200);
    const again = await call(AMAZON, "3.50", "198.51.100.7");
    expect([again.status, (await again.json()).error]).toEqual([429, "free_check_used"]);
  });

  it("serves an Amazon product already in the 48-hour cache without using a site-wide slot", async () => {
    vi.mocked(dbDossierCache.get).mockResolvedValue(dossier(FOUR));
    vi.mocked(getProductDossier).mockResolvedValue({ dossier: dossier(FOUR), cache: "hit" });
    expect(((await (await call(AMAZON)).json()) as QuickCheck).fromCache).toBe(true);
    expect(dbFreeVerdictQuota.reserve).not.toHaveBeenCalled();
  });

  it("stops at the site-wide cap without calling any provider", async () => {
    vi.mocked(dbFreeVerdictQuota.reserve).mockResolvedValue(false);
    const res = await call(AMAZON);
    expect([res.status, (await res.json()).error]).toEqual([429, "free_checks_exhausted"]);
    expect(getProductDossier).not.toHaveBeenCalled();
  });

  it("gives the slots back when a source fails, without naming its secrets", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getProductDossier).mockRejectedValueOnce(new SourceError("aliexpress", "The specified access token is invalid or expired"));
    const failed = await call(AMAZON);
    expect(failed.status).toBe(503);
    expect((await failed.json()).message).not.toMatch(/token/i);
    expect(dbFreeVerdictQuota.release).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });

  it("is off when live sources aren't connected", async () => {
    vi.mocked(liveSources).mockReturnValue({ ready: false, missing: ["retail source: RAINFOREST_API_KEY is not set"] });
    expect((await call(AMAZON)).status).toBe(503);
    expect(dbFreeVerdictQuota.reserve).not.toHaveBeenCalled();
  });
});
