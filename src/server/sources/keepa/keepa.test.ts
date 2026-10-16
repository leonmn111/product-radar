import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { calculateTrendSlope } from "@/engine/trend";
import { QueryBudget } from "@/server/live/budget";
import { SourceError } from "../types";
import { fetchKeepaHistory, HISTORY_DAYS, KEEPA_QUALITY, parseKeepaHistory } from "./index";
import { KEEPA_DOMAIN, keepaMinuteToDate, type KeepaProductResponse } from "./types";

// SAMPLE, NOT REAL DATA: a made-up product in Keepa's documented response format (no Keepa key yet).
const sample = JSON.parse(readFileSync(join(__dirname, "fixtures/SAMPLE-not-real-product-GB.json"), "utf8")) as KeepaProductResponse;
const NOW = new Date("2026-10-16T12:00:00Z");
const budget = () => new QueryBudget({ maxCalls: 2, deadlineMs: 30_000 });

describe("Keepa's formats", () => {
  it("uses Keepa's own domain ids: 2 is amazon.co.uk, 3 is amazon.de", () => {
    expect([KEEPA_DOMAIN.GB, KEEPA_DOMAIN.DE]).toEqual([2, 3]);
  });

  it("converts Keepa Time minutes from 2011-01-01 UTC", () => {
    expect(keepaMinuteToDate(0).toISOString()).toBe("2011-01-01T00:00:00.000Z");
    expect(keepaMinuteToDate(60 * 24).toISOString()).toBe("2011-01-02T00:00:00.000Z");
  });
});

describe("parseKeepaHistory", () => {
  const h = parseKeepaHistory(sample, "B0SAMPLEKP", NOW)!;

  it("keeps the last 90 days of SALES rank and NEW price, one value per day, with its evidence", () => {
    expect(h.domain).toBe(2);
    expect(new Date(h.to).getTime() - new Date(h.from).getTime()).toBe(HISTORY_DAYS * 86_400_000);
    expect(h.salesRank.length).toBeGreaterThanOrEqual(89);
    expect(h.salesRank.length).toBeLessThanOrEqual(91);
    expect(h.salesRank.every((p) => p.at >= new Date(h.from).getTime() - 86_400_000 && Number.isInteger(p.value) && p.value > 0)).toBe(true);
    expect(h.evidence).toMatchObject({ id: "keepa:2:B0SAMPLEKP", provider: "keepa", sourceUrl: "https://keepa.com/#!product/2-B0SAMPLEKP", quality: KEEPA_QUALITY });
  });

  it("treats Keepa's -1 (out of stock) as unknown, never as a price", () => {
    expect(h.newPrice.every((p) => p.value > 0)).toBe(true);
    expect(h.newPrice.length).toBeLessThan(h.salesRank.length); // the out-of-stock days are left out
  });

  it("gives a falling rank (more sales) a negative slope, and the drifting price its own", () => {
    const rankSlope = calculateTrendSlope(h.salesRank)!;
    expect(rankSlope).toBeLessThan(0);
    expect(rankSlope).toBeGreaterThan(-52 * 7 * 1.2); // the sample falls about 52 places a day
    expect(calculateTrendSlope(h.newPrice)!).toBeLessThan(0);
  });

  it("returns nothing for a product Keepa can't give: missing, not standard, or from another marketplace", () => {
    expect(parseKeepaHistory(sample, "B0OTHER000", NOW)).toBeNull();
    const p = sample.products![0];
    expect(parseKeepaHistory({ ...sample, products: [{ ...p, productType: 4 }] }, "B0SAMPLEKP", NOW)).toBeNull();
    expect(parseKeepaHistory({ ...sample, products: [{ ...p, domainId: 3 }] }, "B0SAMPLEKP", NOW)).toBeNull();
  });
});

describe("fetchKeepaHistory", () => {
  it("asks Keepa for 90 days of Amazon UK history and spends one call", async () => {
    const fetchImpl = vi.fn(async () => Response.json(sample));
    const b = budget();
    const h = await fetchKeepaHistory("B0SAMPLEKP", 2, { apiKey: "k", budget: b, fetchImpl: fetchImpl as typeof fetch, now: () => NOW });
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe("https://api.keepa.com/product");
    expect(Object.fromEntries(url.searchParams)).toEqual({ key: "k", domain: "2", asin: "B0SAMPLEKP", history: "1", days: "90" });
    expect(h?.salesRank.length).toBeGreaterThan(0);
    expect(b.callsUsed).toBe(1);
  });

  it("turns Keepa's refusals into a SourceError, with Keepa's message", async () => {
    const out = vi.fn(async () =>
      Response.json({ tokensLeft: -3, refillIn: 4000, refillRate: 20, tokenFlowReduction: 0, tokensConsumed: 0, processingTimeInMs: 1, error: { type: "tokens", message: "Not enough tokens", details: "" } }, { status: 429 }),
    );
    await expect(fetchKeepaHistory("B0SAMPLEKP", 2, { apiKey: "k", budget: budget(), fetchImpl: out as typeof fetch })).rejects.toEqual(
      new SourceError("keepa", "out of tokens: Not enough tokens"),
    );
    await expect(fetchKeepaHistory("not-an-asin", 2, { apiKey: "k", budget: budget() })).rejects.toBeInstanceOf(SourceError);
  });
});
