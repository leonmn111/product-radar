import { describe, expect, it, vi } from "vitest";
import { QueryBudget } from "@/server/live/budget";
import { SourceError } from "../types";
import { AdLibraryRateLimitedError, appUsagePct, createMetaAdLibrarySource, pauseMs } from "./library";
import { adLibraryUrl, nextPage, parseAdsArchive, type AdsArchiveResponse } from "./parse";

// Meta's documented ArchivedAd shape (marketing-api/reference/archived-ad), not a recorded response:
// replace with a recording after the first real call.
const NOW = new Date("2026-10-27T12:00:00.000Z");
const TOKEN = "EAAB-test-token-never-in-urls";
const ad = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  page_id: "1001",
  page_name: "Kitchen Gadgets EU",
  ad_delivery_start_time: "2026-09-01",
  publisher_platforms: ["facebook", "instagram"],
  ad_creative_bodies: ["Silicone kitchen utensil set, 12 pieces, heat resistant"],
  ad_creative_link_titles: ["Shop the 12 piece set"],
  eu_total_reach: 15400,
  ad_snapshot_url: `https://www.facebook.com/ads/archive/render_ad/?id=${id}&access_token=${TOKEN}`,
  ...over,
});
const page = (ads: unknown[], next?: string): AdsArchiveResponse => ({ data: ads as AdsArchiveResponse["data"], paging: next ? { next } : {} });
const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const budget = (maxCalls = 3) => new QueryBudget({ maxCalls, deadlineMs: 30_000 });

describe("parseAdsArchive", () => {
  it("reads each ad into the engine's shape, citing its public Ad Library page", () => {
    const [a] = parseAdsArchive(page([ad("123")]), NOW);
    expect(a).toMatchObject({
      id: "123",
      pageId: "1001",
      pageName: "Kitchen Gadgets EU",
      startedAt: "2026-09-01T00:00:00.000Z",
      stoppedAt: null,
      platforms: ["FACEBOOK", "INSTAGRAM"],
      euReach: 15400,
    });
    expect(a.text).toContain("Silicone kitchen utensil set");
    expect(a.evidence).toMatchObject({ id: "meta_ad_library:123", provider: "meta_ad_library", sourceUrl: adLibraryUrl("123"), quality: 80 });
    expect(a.evidence.claim).toBe('Active ad by "Kitchen Gadgets EU" on Facebook, Instagram, scheduled from 2026-09-01');
  });

  it("never keeps the snapshot URL, which carries the access token", () => {
    expect(JSON.stringify(parseAdsArchive(page([ad("123")]), NOW))).not.toContain(TOKEN);
  });

  it("skips ads without a numeric id or a page, and reach Meta didn't report", () => {
    const ads = parseAdsArchive(page([ad("x1"), ad("124", { page_id: null }), ad("125", { eu_total_reach: undefined })]), NOW);
    expect(ads.map((a) => [a.id, a.euReach])).toEqual([["125", null]]);
  });

  it("follows a next page only on Meta's Graph API host", () => {
    expect(nextPage(page([ad("1")], "https://graph.facebook.com/v26.0/ads_archive?after=abc"))).toBe("https://graph.facebook.com/v26.0/ads_archive?after=abc");
    expect(nextPage(page([ad("1")], "https://evil.example.com/next"))).toBeNull();
    expect(nextPage(page([], "https://graph.facebook.com/v26.0/ads_archive?after=abc"))).toBeNull(); // an empty page is the end
  });
});

describe("createMetaAdLibrarySource", () => {
  const search = { terms: "silicone kitchen utensil 12", countries: ["GB", "DE"] };

  it("asks for active ads that reached the countries, with the token in a header, never the URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(page([ad("1"), ad("2")])));
    const r = await createMetaAdLibrarySource({ accessToken: TOKEN, fetchImpl, now: () => NOW }).activeAds(search, budget());
    expect(r).toMatchObject({ truncated: false, stoppedBecause: null });
    expect(r.ads.map((a) => a.id)).toEqual(["1", "2"]);
    const [url, init] = fetchImpl.mock.calls[0];
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe("https://graph.facebook.com/v26.0/ads_archive");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      search_terms: "silicone kitchen utensil 12",
      search_type: "KEYWORD_UNORDERED",
      ad_type: "ALL",
      ad_active_status: "ACTIVE",
      ad_reached_countries: '["GB","DE"]',
    });
    expect(u.searchParams.get("fields")).not.toContain("ad_snapshot_url");
    expect(String(url)).not.toContain(TOKEN);
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("pages until the page limit, spending one budgeted call per page, and says the counts are lower bounds", async () => {
    const next = "https://graph.facebook.com/v26.0/ads_archive?after=x";
    const fetchImpl = vi.fn(async () => json(page([ad(String(Math.random()).slice(2, 9))], next)));
    const b = budget(5);
    const r = await createMetaAdLibrarySource({ accessToken: TOKEN, fetchImpl, now: () => NOW }).activeAds({ ...search, maxPages: 2 }, b);
    expect([fetchImpl.mock.calls.length, b.callsUsed, r.truncated, r.stoppedBecause]).toEqual([2, 2, true, "page_limit"]);
  });

  it("stops paging once Meta reports 80% of the hourly allowance used", async () => {
    const next = "https://graph.facebook.com/v26.0/ads_archive?after=x";
    const fetchImpl = vi.fn(async () => json(page([ad("1")], next), { "x-app-usage": '{"call_count":82,"total_cputime":10,"total_time":12}' }));
    const r = await createMetaAdLibrarySource({ accessToken: TOKEN, fetchImpl, now: () => NOW }).activeAds(search, budget());
    expect([fetchImpl.mock.calls.length, r.truncated, r.stoppedBecause]).toEqual([1, true, "rate_limit_headroom"]);
  });

  it("returns what it has as a lower bound when the query's budget runs out mid-search, but refuses to start without one", async () => {
    const next = "https://graph.facebook.com/v26.0/ads_archive?after=x";
    const fetchImpl = vi.fn(async () => json(page([ad("1")], next)));
    const source = createMetaAdLibrarySource({ accessToken: TOKEN, fetchImpl, now: () => NOW });
    expect(await source.activeAds({ ...search, maxPages: 5 }, budget(1))).toMatchObject({ truncated: true, stoppedBecause: "budget" });
    const spent = budget(1);
    spent.spendCall();
    await expect(source.activeAds(search, spent)).rejects.toThrow(/budget/);
  });

  it("on throttling, stops calling until Meta says access is back", async () => {
    let clock = NOW.getTime();
    const fetchImpl = vi.fn(async () =>
      json({ error: { code: 613, message: "Calls to this api have exceeded the rate limit." } }, { "x-business-use-case-usage": '{"1":[{"estimated_time_to_regain_access":15}]}' }, 400),
    );
    const source = createMetaAdLibrarySource({ accessToken: TOKEN, fetchImpl, now: () => new Date(clock) });
    await expect(source.activeAds(search, budget())).rejects.toBeInstanceOf(AdLibraryRateLimitedError);
    await expect(source.activeAds(search, budget())).rejects.toBeInstanceOf(AdLibraryRateLimitedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // the second search didn't touch Meta
    clock += 16 * 60_000;
    await expect(source.activeAds(search, budget())).rejects.toBeInstanceOf(AdLibraryRateLimitedError);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // after the 15 minutes, it tries again
  });

  it("names a refused token without echoing Meta's message", async () => {
    const fetchImpl = vi.fn(async () => json({ error: { code: 190, message: `Invalid OAuth access token ${TOKEN}` } }, {}, 400));
    const err = await createMetaAdLibrarySource({ accessToken: TOKEN, fetchImpl, now: () => NOW }).activeAds(search, budget()).catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.message).toMatch(/access token was refused/);
    expect(err.message).not.toContain(TOKEN);
  });
});

describe("rate-limit headers", () => {
  it("reads the highest X-App-Usage figure, and how long a block lasts", () => {
    expect(appUsagePct(new Headers({ "x-app-usage": '{"call_count":12,"total_cputime":40,"total_time":7}' }))).toBe(40);
    expect(appUsagePct(new Headers())).toBeNull();
    expect(pauseMs(new Headers({ "x-business-use-case-usage": '{"9":[{"estimated_time_to_regain_access":5},{"estimated_time_to_regain_access":20}]}' }))).toBe(20 * 60_000);
    expect(pauseMs(new Headers())).toBe(60 * 60_000); // Meta's rolling hour
  });
});
