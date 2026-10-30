import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "@/server/sources/types";
import type { Dossier } from "@/types/dossier";

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env: { FREE_VERDICTS_PER_DAY: 2, FREE_VERDICTS_PER_VISITOR: 1 } }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/server/auth/password", () => ({ clientAddress: (h: Headers) => h.get("x-forwarded-for") }));
vi.mock("@/server/live/config", () => ({ liveSources: vi.fn() }));
vi.mock("@/services/dossierCache", () => ({ dbDossierCache: { get: vi.fn(), put: vi.fn() } }));
vi.mock("@/services/dossierService", () => ({ getProductDossier: vi.fn() }));
vi.mock("@/services/freeVerdicts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/freeVerdicts")>()),
  dbFreeVerdictQuota: { reserve: vi.fn(), release: vi.fn() },
}));

const { liveSources } = await import("@/server/live/config");
const { dbDossierCache } = await import("@/services/dossierCache");
const { getProductDossier } = await import("@/services/dossierService");
const { dbFreeVerdictQuota } = await import("@/services/freeVerdicts");
const { POST } = await import("./route");

const LINK = "https://www.amazon.co.uk/Some-Mug/dp/B0TESTMUG1/ref=sr_1_1";
let ip = 0;
const call = (link: unknown, from = `203.0.113.${++ip}`) =>
  POST(new NextRequest("http://localhost/api/free-verdict", { method: "POST", body: JSON.stringify({ link }), headers: { "x-forwarded-for": from } }));

const flag = (value: boolean, reason: string) => ({ value, reason, evidenceIds: [] });
const flags = (brand?: string) => ({
  brandDirect: flag(false, "the listing names no brand"),
  trademarkRisk: brand ? flag(true, `the product is sold under the brand "${brand}"`) : flag(false, "no brand in the listing text"),
  requiresUKCA: flag(false, "no electrical or toy terms"),
  cosmetics: flag(false, "no cosmetics terms"),
  batteries: flag(false, "no battery terms"),
});
const dossier = (verdict: Dossier["verdict"]): Dossier =>
  ({
    product: { title: "Plain White Ceramic Coffee Mug 350ml", query: "B0TESTMUG1", market: "UK", country: "GB", currency: "GBP", identifiers: { asin: "B0TESTMUG1" } },
    verdict,
    // Three readings from two pages: the count is of pages.
    evidence: [
      { id: "a", sourceUrl: "https://www.amazon.co.uk/dp/B0TESTMUG1" },
      { id: "b", sourceUrl: "https://www.aliexpress.com/item/1.html" },
      { id: "c", sourceUrl: "https://www.amazon.co.uk/dp/B0TESTMUG1" },
    ],
    supplierMatches: [{ title: "Mug" }],
    resellability: flags(),
    landedMargin: { status: "shown", confidence: 0.8, value: { uk: { netProfit: { amount: 5.63, currency: "GBP" } } }, evidenceIds: [] },
  }) as unknown as Dossier;
const shown = dossier({ status: "shown", confidence: 0.82, value: { kind: "TEST", label: "Test small", gate: null, reasons: ["£5.63 net per unit (21% of the price)"] }, evidenceIds: [] });

beforeEach(() => {
  vi.mocked(liveSources).mockReturnValue({ ready: true, sample: false, sources: {} as never });
  vi.mocked(dbDossierCache.get).mockResolvedValue(null);
  vi.mocked(dbFreeVerdictQuota.reserve).mockReset().mockResolvedValue(true);
  vi.mocked(dbFreeVerdictQuota.release).mockReset().mockResolvedValue();
  vi.mocked(getProductDossier).mockReset().mockResolvedValue({ dossier: shown, cache: "miss" });
});

describe("POST /api/free-verdict", () => {
  it("names the risk when a branded product fails the resale checks: High IP Risk", async () => {
    const branded = { ...shown, resellability: flags("Anker") } as Dossier;
    vi.mocked(getProductDossier).mockResolvedValue({ dossier: branded, cache: "miss" });
    expect((await (await call(LINK)).json()).risk).toBe("ip");
  });

  it("refuses what it can't read before anything is spent", async () => {
    for (const link of ["", "https://www.aliexpress.com/item/1005010414755062.html", "https://amzn.eu/d/abc", 42]) {
      const res = await call(link);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_link");
    }
    expect(dbFreeVerdictQuota.reserve).not.toHaveBeenCalled();
    expect(getProductDossier).not.toHaveBeenCalled();
  });

  it("gives the verdict and its confidence, never the margin figures, and takes one of today's slots", async () => {
    const res = await call(LINK);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      asin: "B0TESTMUG1",
      title: "Plain White Ceramic Coffee Mug 350ml",
      verdict: { status: "shown", kind: "TEST", gate: null, confidence: 0.82 },
      evidenceCount: 2,
      supplierMatches: 1,
      risk: null,
      fromCache: false,
      fullDossier: "/signin?tab=register&callbackUrl=%2Fterminal%3Fasin%3DB0TESTMUG1",
    });
    expect(JSON.stringify(body)).not.toMatch(/5\.63|reasons|net per unit/);
    expect(dbFreeVerdictQuota.reserve).toHaveBeenCalledWith(expect.any(Date), 2);
    expect(getProductDossier).toHaveBeenCalledWith("B0TESTMUG1", expect.objectContaining({ sample: false }));
    // Built on the live clock: a clock frozen at the start of the request would date the evidence in the future.
    expect(vi.mocked(getProductDossier).mock.calls[0][1]).not.toHaveProperty("now");
  });

  it("allows one free check per visitor a day", async () => {
    expect((await call(LINK, "198.51.100.7")).status).toBe(200);
    const again = await call(LINK, "198.51.100.7");
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ error: "free_check_used", signUp: expect.stringContaining("asin%3DB0TESTMUG1") });
  });

  it("serves a product already in the 48-hour cache without using a site-wide slot", async () => {
    vi.mocked(dbDossierCache.get).mockResolvedValue({ ...shown, sample: false });
    vi.mocked(getProductDossier).mockResolvedValue({ dossier: shown, cache: "hit" });
    const res = await call(LINK);
    expect(res.status).toBe(200);
    expect((await res.json()).fromCache).toBe(true);
    expect(dbFreeVerdictQuota.reserve).not.toHaveBeenCalled();
  });

  it("stops at the site-wide cap without calling any provider, and the visitor keeps their check", async () => {
    vi.mocked(dbFreeVerdictQuota.reserve).mockResolvedValue(false);
    const res = await call(LINK, "198.51.100.8");
    expect([res.status, (await res.json()).error]).toEqual([429, "free_checks_exhausted"]);
    expect(getProductDossier).not.toHaveBeenCalled();
    vi.mocked(dbFreeVerdictQuota.reserve).mockResolvedValue(true);
    expect((await call(LINK, "198.51.100.8")).status).toBe(200);
  });

  it("gives both slots back when a source fails or the product doesn't exist", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getProductDossier).mockRejectedValueOnce(new SourceError("aliexpress", "The specified access token is invalid or expired"));
    const failed = await call(LINK, "198.51.100.9");
    expect(failed.status).toBe(503);
    expect((await failed.json()).message).not.toMatch(/token/i);
    expect(dbFreeVerdictQuota.release).toHaveBeenCalledTimes(1);

    vi.mocked(getProductDossier).mockResolvedValueOnce(null);
    expect((await call(LINK, "198.51.100.9")).status).toBe(404); // same visitor: their check came back
    expect(dbFreeVerdictQuota.release).toHaveBeenCalledTimes(2);
    expect((await call(LINK, "198.51.100.9")).status).toBe(200);
    errors.mockRestore();
  });

  it("says what's missing when the evidence is too thin for a verdict", async () => {
    vi.mocked(getProductDossier).mockResolvedValue({
      dossier: dossier({ status: "withheld", reason: "Insufficient Data", confidence: 0.31, missing: ["more independent Amazon UK listings of this product (1 found agree on it)"] }),
      cache: "miss",
    });
    const body = await (await call(LINK)).json();
    expect(body.verdict).toEqual({ status: "withheld", reason: "Insufficient Data", confidence: 0.31, missing: ["more independent Amazon UK listings of this product (1 found agree on it)"] });
  });

  it("is off, before payment of any kind, when live sources aren't connected", async () => {
    vi.mocked(liveSources).mockReturnValue({ ready: false, missing: ["retail source: RAINFOREST_API_KEY is not set"] });
    expect((await call(LINK)).status).toBe(503);
    expect(dbFreeVerdictQuota.reserve).not.toHaveBeenCalled();
  });
});
