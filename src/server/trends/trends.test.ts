import { describe, expect, it } from "vitest";
import { EvidenceInput } from "@/lib/validation/evidence";
import { latestCompleteMonth, monthlyInterest, trendContentHash, trendEvidence } from "./evidence";
import { fetchInterestOverTime, googleTrendsUrl, parseInterestOverTime, SerpApiError, searchesLeft } from "./serpapi";

const PRODUCT_ID = "0199c5a0-0000-7000-8000-000000000001";
const DAY = 86_400_000;
const sunday = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);

// Shaped like SerpApi's google_trends TIMESERIES response (test data, not real figures).
function response(weeks: [string, string, number?][], extra: Record<string, unknown> = {}) {
  return {
    search_metadata: { status: "Success" },
    interest_over_time: {
      timeline_data: weeks.map(([start, value, extracted]) => ({
        date: start,
        timestamp: String(sunday(start)),
        values: [{ query: "skullcandy method 360", value, extracted_value: extracted ?? Number(value.replace("<", "")) }],
      })),
    },
    ...extra,
  };
}

const SERIES = response([
  ["2026-07-26", "40"], // starts after day 7 of July → July is incomplete, dropped
  ["2026-08-02", "40"],
  ["2026-08-09", "50"],
  ["2026-08-16", "60"],
  ["2026-08-23", "70"],
  ["2026-08-30", "80"],
  ["2026-09-06", "90"],
  ["2026-09-13", "100"],
  ["2026-09-20", "<1", 0],
  ["2026-09-27", "50"],
  ["2026-10-04", "65"], // fetch month → incomplete, dropped
]);
const FETCHED = new Date("2026-10-11T12:00:00Z");

describe("parseInterestOverTime", () => {
  it("reads weekly values in date order, treating <1 as 0", () => {
    const weeks = parseInterestOverTime(SERIES);
    expect(weeks).toHaveLength(11);
    expect(weeks[0]).toEqual({ weekStart: new Date("2026-07-26T00:00:00Z"), value: 40 });
    expect(weeks.find((w) => w.weekStart.toISOString().startsWith("2026-09-20"))?.value).toBe(0);
  });

  it("skips the week Google is still counting", () => {
    const json = response([["2026-09-27", "50"], ["2026-10-04", "65"]]);
    (json.interest_over_time.timeline_data[1] as Record<string, unknown>).partial_data = true;
    expect(parseInterestOverTime(json)).toHaveLength(1);
  });

  it("reports no data for an all-zero series or Google's no-results message", () => {
    const zeros = response([["2026-09-06", "0"], ["2026-09-13", "<1", 0]]);
    expect(() => parseInterestOverTime(zeros)).toThrow(expect.objectContaining({ code: "no_data" }));
    const none = { error: "Google Trends hasn't returned any results for this query." };
    expect(() => parseInterestOverTime(none)).toThrow(expect.objectContaining({ code: "no_data" }));
  });

  it("classifies key and quota errors", () => {
    expect(() => parseInterestOverTime({ error: "Invalid API key. Your API key should be here: …" })).toThrow(
      expect.objectContaining({ code: "auth" }),
    );
    expect(() => parseInterestOverTime({ error: "Your account has run out of searches." })).toThrow(
      expect.objectContaining({ code: "quota" }),
    );
  });

  it("rejects a response it doesn't understand", () => {
    expect(() => parseInterestOverTime({ interest_over_time: { timeline_data: [{ values: [] }] } })).toThrow(SerpApiError);
  });
});

describe("monthlyInterest", () => {
  it("averages complete months only", () => {
    const months = monthlyInterest(parseInterestOverTime(SERIES), FETCHED);
    expect(months.map((m) => [m.month, m.average, m.weeks.length])).toEqual([
      ["2026-08", 60, 5],
      ["2026-09", 60, 4],
    ]);
  });

  it("dates each month at the end of its last week", () => {
    const [aug, sep] = monthlyInterest(parseInterestOverTime(SERIES), FETCHED);
    expect(aug.observedAt).toEqual(new Date("2026-09-06T00:00:00Z"));
    expect(sep.observedAt).toEqual(new Date("2026-10-04T00:00:00Z"));
  });

  it("never dates a month after the fetch", () => {
    const weeks = [{ weekStart: new Date("2026-09-27T00:00:00Z"), value: 50 }, { weekStart: new Date("2026-09-06T00:00:00Z"), value: 50 }]
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
    const fetched = new Date("2026-10-01T09:00:00Z");
    expect(monthlyInterest(weeks, fetched)[0].observedAt).toEqual(fetched);
  });
});

describe("trendEvidence", () => {
  const series = { keyword: "skullcandy method 360", trendsUrl: googleTrendsUrl("skullcandy method 360"), fetchedAt: FETCHED, weeks: parseInterestOverTime(SERIES) };

  it("makes one valid, sourced, quality-scored row per complete month", () => {
    const rows = trendEvidence(PRODUCT_ID, series);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(() => EvidenceInput.parse(r)).not.toThrow();
    expect(rows[0]).toMatchObject({
      metric: "SEARCH_INTEREST",
      metricValue: 60,
      sourceType: "OTHER",
      qualityScore: 70,
      sourceUrl: "https://trends.google.com/trends/explore?date=today+12-m&q=skullcandy+method+360",
    });
    expect(rows[0].claim).toBe(
      'Google search interest for "skullcandy method 360" averaged 60/100 in August 2026 (100 = its busiest week in the 12 months to 11 Oct 2026)',
    );
    expect(rows[1].excerpt).toBe("Weekly values: 6 Sept 90, 13 Sept 100, 20 Sept 0, 27 Sept 50. Retrieved 2026-10-11.");
  });

  it("gives each keyword-month a stable dedupe key", () => {
    const [aug] = trendEvidence(PRODUCT_ID, series);
    expect(aug.contentHash).toBe(trendContentHash("Skullcandy Method 360", "2026-08"));
    expect(aug.contentHash).not.toBe(trendContentHash("skullcandy method 360", "2026-09"));
  });
});

describe("latestCompleteMonth", () => {
  it("is the month before now", () => {
    expect(latestCompleteMonth(new Date("2026-10-11T00:00:00Z"))).toBe("2026-09");
    expect(latestCompleteMonth(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12");
  });
});

describe("SerpApi calls", () => {
  const fakeFetch = (status: number, body: unknown) => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { f, calls };
  };

  it("asks for 12 months of weekly interest and keeps the key out of the result", async () => {
    const { f, calls } = fakeFetch(200, SERIES);
    const s = await fetchInterestOverTime("skullcandy method 360", "KEY123", f);
    expect(calls[0]).toContain("engine=google_trends");
    expect(calls[0]).toContain("date=today+12-m");
    expect(s.trendsUrl).not.toContain("KEY123");
    expect(JSON.stringify(s)).not.toContain("KEY123");
    expect(Date.now() - s.fetchedAt.getTime()).toBeLessThan(DAY);
  });

  it("maps HTTP 401 and 429 to auth and quota errors", async () => {
    await expect(fetchInterestOverTime("x", "bad", fakeFetch(401, { error: "Invalid API key." }).f)).rejects.toMatchObject({ code: "auth" });
    await expect(fetchInterestOverTime("x", "k", fakeFetch(429, { error: "Your account has run out of searches." }).f)).rejects.toMatchObject({
      code: "quota",
    });
  });

  it("reads searches left from the free account endpoint", async () => {
    const { f, calls } = fakeFetch(200, { plan_name: "Free Plan", plan_searches_left: 248, total_searches_left: 248, api_key: "KEY123" });
    expect(await searchesLeft("KEY123", f)).toEqual({ left: 248, plan: "Free Plan" });
    expect(calls[0]).toContain("/account.json");
  });
});
