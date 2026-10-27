import { describe, expect, it, vi } from "vitest";
import type { ObservedAd } from "@/server/live/types";
import type { AdLibrarySource } from "@/server/sources/types";
import { adLibraryUrl } from "@/server/sources/metaAds/parse";
import { adMomentumTrend, adSearchFor, getAdMomentum, memoryAdSearchCache, SCALING_MIN_DAYS, summariseAdMomentum } from "./metaAds";

const NOW = new Date("2026-10-27T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const TERM = "silicone kitchen utensil 12";

let n = 0;
const ad = (over: Partial<ObservedAd> = {}): ObservedAd => {
  const id = String(++n);
  return {
    id,
    pageId: "p1",
    pageName: "Kitchen Gadgets EU",
    startedAt: daysAgo(10),
    stoppedAt: null,
    platforms: ["FACEBOOK"],
    text: "Silicone kitchen utensil set, 12 pieces",
    euReach: 1000,
    evidence: { id: `meta_ad_library:${id}`, provider: "meta_ad_library", sourceUrl: adLibraryUrl(id), observedAt: NOW.toISOString(), quality: 80, claim: "Active ad" },
    ...over,
  };
};
const source = (ads: ObservedAd[] | Error, truncated = false): AdLibrarySource & { activeAds: ReturnType<typeof vi.fn> } => ({
  name: "meta_ad_library",
  activeAds: vi.fn(async () => {
    if (ads instanceof Error) throw ads;
    return { ads, truncated, stoppedBecause: truncated ? ("page_limit" as const) : null };
  }),
});

describe("summariseAdMomentum", () => {
  it("counts only ads whose own words carry the product's key words", () => {
    const { momentum, matched } = summariseAdMomentum(TERM, ["GB"], [ad(), ad({ text: "Silicone baking mat" }), ad({ text: "12 piece kitchen utensil set in silicone" })], {
      now: NOW,
      truncated: false,
    });
    expect(matched).toHaveLength(2);
    expect(momentum.activeAds).toBe(2);
  });

  it("calls an ad scaling when it has run 30+ days, or its advertiser runs 3+ matching ads at once", () => {
    const ads = [
      ad({ pageId: "old", startedAt: daysAgo(SCALING_MIN_DAYS) }), // long-running
      ad({ pageId: "new", startedAt: daysAgo(2) }), // fresh, one-off
      ...[1, 2, 3].map(() => ad({ pageId: "dup", startedAt: daysAgo(5) })), // one advertiser, three variants
    ];
    const { momentum } = summariseAdMomentum(TERM, ["GB"], ads, { now: NOW, truncated: true });
    expect(momentum).toMatchObject({
      activeAds: 5,
      scalingAds: 4,
      advertisers: 3,
      newAds7d: 4,
      longestRunningDays: 30,
      medianAgeDays: 5,
      euReach: 5000,
      truncated: true,
      methodologyVersion: "1.0.0",
    });
  });

  it("leaves age and reach unknown rather than guessing", () => {
    const { momentum } = summariseAdMomentum(TERM, ["GB"], [ad({ startedAt: null, euReach: null })], { now: NOW, truncated: false });
    expect(momentum).toMatchObject({ activeAds: 1, longestRunningDays: null, medianAgeDays: null, euReach: null, newAds7d: 0 });
  });
});

describe("adMomentumTrend", () => {
  const snap = (activeAds: number, d: number) => ({ activeAds, observedAt: daysAgo(d) });
  it("is rising, falling or flat on a 10% change in active ads between snapshots", () => {
    expect(adMomentumTrend(snap(10, 7), snap(14, 0))).toEqual({ direction: "RISING", changePct: 40, days: 7 });
    expect(adMomentumTrend(snap(10, 7), snap(8, 0))).toEqual({ direction: "FALLING", changePct: -20, days: 7 });
    expect(adMomentumTrend(snap(10, 7), snap(10, 0)).direction).toBe("FLAT");
    expect(adMomentumTrend(snap(0, 7), snap(3, 0))).toEqual({ direction: "RISING", changePct: null, days: 7 });
  });
});

describe("getAdMomentum", () => {
  const five = () => [1, 2, 3, 4, 5].map((i) => ad({ pageId: `p${i}` }));

  it("shows the counts once enough matching ads back them (0.7), with every ad cited", async () => {
    const r = await getAdMomentum("Silicone Kitchen Utensil Set 12 Piece", { source: source(five()), cache: memoryAdSearchCache(), now: () => NOW });
    expect(r.momentum.status).toBe("shown");
    expect(r.momentum.confidence).toBeGreaterThanOrEqual(0.7);
    if (r.momentum.status === "shown") expect(r.momentum.value).toMatchObject({ term: TERM, activeAds: 5, advertisers: 5 });
    expect(r.evidence.every((e) => e.sourceType === "ads_library" && e.sourceUrl.startsWith("https://www.facebook.com/ads/library/?id="))).toBe(true);
    expect(r.coverage).toMatch(/only when they reached the EU/);
  });

  it("withholds below the gate, and when nothing matches, rather than reporting zero demand", async () => {
    const few = await getAdMomentum(TERM, { source: source(five().slice(0, 2)), cache: memoryAdSearchCache(), now: () => NOW });
    expect(few.momentum).toMatchObject({ status: "withheld", reason: "Insufficient Data", missing: ["more matching active ads (2 found)"] });
    const none = await getAdMomentum(TERM, { source: source([]), cache: memoryAdSearchCache(), now: () => NOW });
    expect(none.momentum.status === "withheld" && none.momentum.missing[0]).toMatch(/none visible/);
  });

  it("never reads a failed or throttled search as no ads, and doesn't cache it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cache = memoryAdSearchCache();
    const failing = source(new Error("meta_ad_library: rate limited"));
    const r = await getAdMomentum(TERM, { source: failing, cache, now: () => NOW });
    expect(r.momentum.status === "withheld" && r.momentum.missing[0]).toMatch(/search failed just now/);
    await getAdMomentum(TERM, { source: failing, cache, now: () => NOW });
    expect(failing.activeAds).toHaveBeenCalledTimes(2);
  });

  it("asks Meta once a day per search, and says so when no token is set", async () => {
    const s = source(five());
    const deps = { source: s, cache: memoryAdSearchCache(), now: () => NOW };
    await getAdMomentum(TERM, deps);
    await getAdMomentum(TERM, deps);
    expect(s.activeAds).toHaveBeenCalledOnce();
    expect(s.activeAds.mock.calls[0][0]).toMatchObject({ terms: TERM, exactPhrase: false, countries: ["GB", "IE", "DE", "FR", "ES", "IT", "NL"] });
    const off = await getAdMomentum(TERM, { source: null });
    expect(off.momentum).toMatchObject({ status: "withheld", missing: ["Ad data pending Meta approval"] });
    expect([off.pending, off.observation]).toEqual([true, null]);
  });

  it("searches a brand as an exact phrase", () => {
    expect(adSearchFor("Ooni", { brand: true })).toEqual({ terms: "Ooni", exactPhrase: true });
    expect(adSearchFor("Silicone Kitchen Utensil Set 12 Piece")).toEqual({ terms: TERM, exactPhrase: false });
  });
});
