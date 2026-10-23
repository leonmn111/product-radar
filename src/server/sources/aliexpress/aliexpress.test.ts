import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { QueryBudget } from "@/server/live/budget";
import { SourceError } from "../types";
import { createAliexpressSource, signParams } from "./index";
import { ALIEXPRESS_QUALITY, aliexpressError, parseTextSearch, tokenRejected } from "./parse";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));
const sample = fixture("sample-text-search-GB.json");
const recorded = fixture("recorded-text-search-GB.json");
const at = new Date("2026-10-23T12:00:00.000Z");

describe("parseTextSearch", () => {
  it("reads offers priced in the market's currency, with evidence and no invented shipping", () => {
    const offers = parseTextSearch(sample, "GB", at);
    expect(offers).toHaveLength(8);
    expect(offers[0]).toMatchObject({
      id: "1005009000000001",
      url: "https://www.aliexpress.com/item/1005009000000001.html",
      unitPrice: { amount: 5.89, currency: "GBP" },
      shipping: null,
      shipsTo: "GB",
      evidence: { id: "aliexpress:1005009000000001:GB", provider: "aliexpress", quality: ALIEXPRESS_QUALITY, observedAt: at.toISOString() },
    });
    expect(offers[0].evidence.claim).toContain("5.89 GBP on AliExpress, ships to GB, 2311 orders, 96.1% positive feedback");
  });

  it("reads a real recorded response, citing the plain product page rather than the tracked link", () => {
    const offers = parseTextSearch(recorded, "GB", at);
    expect(offers).toHaveLength(9);
    expect(offers.every((o) => o.unitPrice.currency === "GBP" && o.unitPrice.amount > 0)).toBe(true);
    expect(offers[0]).toMatchObject({
      id: "1005010414755062",
      url: "https://www.aliexpress.com/item/1005010414755062.html",
      unitPrice: { amount: 3.08, currency: "GBP" },
      image: expect.stringMatching(/^https:\/\/ae-pic-a1\.aliexpress-media\.com\//),
    });
    expect(offers[0].evidence.claim).toMatch(/: 3\.08 GBP on AliExpress, ships to GB, 84 orders, 82\.2% positive feedback, rated 4\.1\/5$/);
    expect(offers.map((o) => o.url).join(" ")).not.toMatch(/appkey|skuId/);
    // No rating yet: the claim says only what the listing does.
    const unrated = offers.find((o) => o.id === "1005012905753576")!;
    expect(unrated.evidence.claim).toMatch(/3\.30 GBP on AliExpress, ships to GB, 14 orders$/);
  });

  it("skips items without an id, title, price or currency, and reads the currency from originMinPrice when needed", () => {
    const item = { itemId: "1005000000000001", title: "Phone stand", targetSalePrice: "2.50", targetOriginalPriceCurrency: "GBP" };
    const json = {
      aliexpress_ds_text_search_response: {
        code: "00",
        data: {
          products: {
            selection_search_product: [
              item,
              { ...item, itemId: undefined },
              { ...item, title: " " },
              { ...item, targetSalePrice: "0" },
              { ...item, itemId: "1005000000000002", targetOriginalPriceCurrency: undefined, originMinPrice: '{"currencyCode":"EUR","cent":250}' },
              { ...item, itemId: "1005000000000003", targetOriginalPriceCurrency: undefined },
            ],
          },
        },
      },
    };
    expect(parseTextSearch(json, "GB", at).map((o) => [o.id, o.unitPrice.currency])).toEqual([
      ["1005000000000001", "GBP"],
      ["1005000000000002", "EUR"],
    ]);
    expect(parseTextSearch({ aliexpress_ds_text_search_response: { code: "00", data: { totalCount: 0 } } }, "GB", at)).toEqual([]);
  });

  it("recognises the platform's error shapes", () => {
    expect(aliexpressError(recorded)).toBeNull();
    expect(aliexpressError({ error_response: { code: "IncompleteSignature", msg: "The request signature does not conform" } })).toBe(
      "The request signature does not conform",
    );
    expect(aliexpressError({ aliexpress_ds_text_search_response: { code: "EXCEPTION_TEXT_SEARCH_FOR_DS" } })).toBe("code EXCEPTION_TEXT_SEARCH_FOR_DS");
    expect(aliexpressError({})).toBe("unexpected response");
    expect(tokenRejected({ error_response: { code: "IllegalAccessToken", msg: "The specified access token is invalid or expired" } })).toBe(true);
    expect(tokenRejected({ error_response: { code: "IncompleteSignature" } })).toBe(false);
  });
});

const tokens = (token = "tok") => ({ accessToken: vi.fn(async () => token), invalidate: vi.fn() });

describe("createAliexpressSource", () => {
  it("signs a Drop Shipping search for the market's country, language and currency, with the access token, and spends one call", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => (init?.body ? Response.json(sample) : Response.error()));
    const budget = new QueryBudget({ maxCalls: 3, deadlineMs: 30_000 });
    const offers = await createAliexpressSource({ appKey: "k", appSecret: "s", tokens: tokens(), fetchImpl: fetchImpl as typeof fetch, now: () => at }).search(
      "magnetic power bank",
      "GB",
      budget,
    );
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api-sg.aliexpress.com/sync");
    const body = new URLSearchParams(String(fetchImpl.mock.calls[0][1]?.body));
    expect(Object.fromEntries(["method", "keyWord", "local", "countryCode", "currency", "access_token", "sign_method"].map((k) => [k, body.get(k)]))).toEqual({
      method: "aliexpress.ds.text.search",
      keyWord: "magnetic power bank",
      local: "en_GB",
      countryCode: "GB",
      currency: "GBP",
      access_token: "tok",
      sign_method: "sha256",
    });
    const { sign, ...signed } = Object.fromEntries(body);
    expect(sign).toBe(signParams(signed, "s"));
    expect(offers).toHaveLength(8);
    expect(budget.callsUsed).toBe(1);
  });

  it("asks in US dollars for the US", async () => {
    const fetchImpl = vi.fn(async () => Response.json(fixture("sample-text-search-US.json")));
    const offers = await createAliexpressSource({ appKey: "k", appSecret: "s", tokens: tokens(), fetchImpl: fetchImpl as typeof fetch }).search(
      "magnetic power bank",
      "US",
      new QueryBudget({ maxCalls: 1, deadlineMs: 1000 }),
    );
    const body = new URLSearchParams(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect([body.get("local"), body.get("countryCode"), body.get("currency")]).toEqual(["en_US", "US", "USD"]);
    expect(offers[0].unitPrice).toEqual({ amount: 7.77, currency: "USD" });
  });

  it("signs over the parameters sorted by name, with a system call's path first", () => {
    expect(signParams({ b: "2", a: "1" }, "secret")).toBe(signParams({ a: "1", b: "2" }, "secret"));
    expect(signParams({ a: "1" }, "secret")).toMatch(/^[0-9A-F]{64}$/);
    expect(signParams({ a: "1" }, "secret", "/auth/token/refresh")).not.toBe(signParams({ a: "1" }, "secret"));
  });

  it("turns a platform error into a SourceError, and reports a refused token so it's renewed", async () => {
    const keeper = tokens();
    const refused = vi.fn(async () => Response.json({ error_response: { code: "IllegalAccessToken", msg: "The specified access token is invalid or expired" } }));
    await expect(
      createAliexpressSource({ appKey: "k", appSecret: "s", tokens: keeper, fetchImpl: refused as typeof fetch }).search("x", "US", new QueryBudget({ maxCalls: 1, deadlineMs: 1000 })),
    ).rejects.toEqual(new SourceError("aliexpress", "The specified access token is invalid or expired"));
    expect(keeper.invalidate).toHaveBeenCalledOnce();

    const other = tokens();
    const signature = vi.fn(async () => Response.json({ error_response: { code: "IncompleteSignature", msg: "Bad signature" } }));
    await expect(
      createAliexpressSource({ appKey: "k", appSecret: "s", tokens: other, fetchImpl: signature as typeof fetch }).search("x", "US", new QueryBudget({ maxCalls: 1, deadlineMs: 1000 })),
    ).rejects.toEqual(new SourceError("aliexpress", "Bad signature"));
    expect(other.invalidate).not.toHaveBeenCalled();
  });

  it("never reaches AliExpress once the budget is spent", async () => {
    const fetchImpl = vi.fn();
    const budget = new QueryBudget({ maxCalls: 0, deadlineMs: 1000 });
    await expect(createAliexpressSource({ appKey: "k", appSecret: "s", tokens: tokens(), fetchImpl: fetchImpl as never }).search("x", "GB", budget)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
