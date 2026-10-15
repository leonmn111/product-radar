import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { QueryBudget } from "@/server/live/budget";
import { SourceError } from "../types";
import { createAliexpressSource, signParams } from "./index";
import { ALIEXPRESS_QUALITY, aliexpressError, parseProductQuery } from "./parse";

const sample = JSON.parse(readFileSync(join(__dirname, "fixtures/sample-product-query-GB.json"), "utf8"));
const at = new Date("2026-10-15T12:00:00.000Z");

describe("parseProductQuery", () => {
  it("reads offers priced in the market's currency, with evidence and no invented shipping", () => {
    const offers = parseProductQuery(sample, "GB", at);
    expect(offers).toHaveLength(8);
    expect(offers[0]).toMatchObject({
      id: "1005009000000001",
      url: "https://www.aliexpress.com/item/1005009000000001.html",
      unitPrice: { amount: 5.89, currency: "GBP" },
      shipping: null,
      shipsTo: "GB",
      evidence: { id: "aliexpress:1005009000000001:GB", provider: "aliexpress", quality: ALIEXPRESS_QUALITY, observedAt: at.toISOString() },
    });
    expect(offers[0].evidence.claim).toContain("5.89 GBP on AliExpress, ships to GB, 2311 sold recently, 96.1% positive feedback");
  });

  it("recognises the platform's error shapes", () => {
    expect(aliexpressError(sample)).toBeNull();
    expect(aliexpressError({ error_response: { code: "IncompleteSignature", msg: "The request signature does not conform" } })).toBe(
      "The request signature does not conform",
    );
    expect(aliexpressError({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 405, resp_msg: "No result" } } })).toBe("No result");
  });
});

describe("createAliexpressSource", () => {
  it("signs a query for the market's country and currency, and spends one call", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => (init?.body ? Response.json(sample) : Response.error()));
    const budget = new QueryBudget({ maxCalls: 3, deadlineMs: 30_000 });
    const offers = await createAliexpressSource({ appKey: "k", appSecret: "s", trackingId: "t", fetchImpl: fetchImpl as typeof fetch, now: () => at }).search(
      "magnetic power bank",
      "GB",
      budget,
    );
    const body = new URLSearchParams(String(fetchImpl.mock.calls[0][1]?.body));
    expect(Object.fromEntries(["method", "keywords", "ship_to_country", "target_currency", "sign_method"].map((k) => [k, body.get(k)]))).toEqual({
      method: "aliexpress.affiliate.product.query",
      keywords: "magnetic power bank",
      ship_to_country: "GB",
      target_currency: "GBP",
      sign_method: "sha256",
    });
    const { sign, ...signed } = Object.fromEntries(body);
    expect(sign).toBe(signParams(signed, "s"));
    expect(offers).toHaveLength(8);
    expect(budget.callsUsed).toBe(1);
  });

  it("signs over the parameters sorted by name", () => {
    expect(signParams({ b: "2", a: "1" }, "secret")).toBe(signParams({ a: "1", b: "2" }, "secret"));
    expect(signParams({ a: "1" }, "secret")).toMatch(/^[0-9A-F]{64}$/);
  });

  it("turns a platform error into a SourceError", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error_response: { code: "InvalidAppKey", msg: "Invalid app key" } }));
    await expect(
      createAliexpressSource({ appKey: "k", appSecret: "s", trackingId: "t", fetchImpl: fetchImpl as typeof fetch }).search("x", "US", new QueryBudget({ maxCalls: 1, deadlineMs: 1000 })),
    ).rejects.toEqual(new SourceError("aliexpress", "Invalid app key"));
  });
});
