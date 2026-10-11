// Google Trends "interest over time" through SerpApi (https://serpapi.com/google-trends-api).
// One call = one search from the plan (free plan: 250 a month); the Account API is free.
// The API key travels only in request URLs, so nothing here logs a URL.

import { z } from "zod";

const SERPAPI = "https://serpapi.com";
const TIMEOUT_MS = 60_000;
export const TRENDS_WINDOW = "today 12-m";

export type SerpApiErrorCode = "auth" | "quota" | "no_data" | "timeout" | "http_error" | "bad_response";

export class SerpApiError extends Error {
  constructor(
    message: string,
    readonly code: SerpApiErrorCode,
  ) {
    super(message);
    this.name = "SerpApiError";
  }
}

/** One week of Google search interest: 0–100, relative to the busiest week in the window. */
export type WeeklyInterest = { weekStart: Date; value: number };

export type InterestSeries = {
  keyword: string;
  trendsUrl: string; // the same chart on Google Trends, for people to check
  fetchedAt: Date;
  weeks: WeeklyInterest[];
};

/** The Google Trends page showing the chart this data comes from. */
export function googleTrendsUrl(keyword: string) {
  return `https://trends.google.com/trends/explore?${new URLSearchParams({ date: TRENDS_WINDOW, q: keyword })}`;
}

const TrendsResponse = z.object({
  error: z.string().optional(),
  interest_over_time: z
    .object({
      timeline_data: z.array(
        z.object({
          timestamp: z.coerce.number().int().positive(), // unix seconds, start of the week
          partial_data: z.boolean().optional(), // the current week, still being counted
          values: z
            .array(
              z.object({
                query: z.string().optional(),
                value: z.string().optional(), // "45", or "<1"
                extracted_value: z.number().optional(),
              }),
            )
            .min(1),
        }),
      ),
    })
    .optional(),
});

function errorFrom(message: string): SerpApiError {
  if (/invalid api key|api key.*(missing|invalid)/i.test(message)) return new SerpApiError(message, "auth");
  if (/run out of searches|searches? (limit|left)|plan.*limit|rate limit/i.test(message)) return new SerpApiError(message, "quota");
  if (/hasn.t returned any results|no results/i.test(message)) return new SerpApiError(message, "no_data");
  return new SerpApiError(message, "http_error");
}

/** Pure: the weekly series from a SerpApi google_trends TIMESERIES response. */
export function parseInterestOverTime(json: unknown): WeeklyInterest[] {
  const parsed = TrendsResponse.safeParse(json);
  if (!parsed.success) throw new SerpApiError("SerpApi returned an unexpected response.", "bad_response");
  if (parsed.data.error) throw errorFrom(parsed.data.error);

  const weeks = (parsed.data.interest_over_time?.timeline_data ?? [])
    .filter((w) => !w.partial_data)
    .map((w) => {
      const v = w.values[0];
      const value = v.extracted_value ?? (v.value?.startsWith("<") ? 0 : Number(v.value));
      return { weekStart: new Date(w.timestamp * 1000), value };
    })
    .filter((w) => Number.isFinite(w.value) && w.value >= 0 && w.value <= 100)
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

  // All zeros means Google has too little search volume to chart the term.
  if (weeks.length === 0 || weeks.every((w) => w.value === 0)) {
    throw new SerpApiError("Google Trends has no search-interest data for this keyword.", "no_data");
  }
  return weeks;
}

async function getJson(path: string, params: Record<string, string>, fetchImpl: typeof fetch) {
  let res: Response;
  try {
    res = await fetchImpl(`${SERPAPI}${path}?${new URLSearchParams(params)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new SerpApiError("SerpApi took too long to respond.", "timeout");
    }
    throw new SerpApiError("Couldn't reach SerpApi.", "http_error");
  }
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (!res.ok) {
    const message = typeof body?.error === "string" ? body.error : `SerpApi answered HTTP ${res.status}.`;
    if (res.status === 401) throw new SerpApiError(message, "auth");
    if (res.status === 429) throw new SerpApiError(message, "quota");
    throw errorFrom(message);
  }
  if (body === null) throw new SerpApiError("SerpApi returned an unreadable response.", "bad_response");
  return body;
}

/** Weekly Google search interest for one keyword over the last 12 months. Uses one search. */
export async function fetchInterestOverTime(keyword: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<InterestSeries> {
  const json = await getJson(
    "/search.json",
    { engine: "google_trends", q: keyword, data_type: "TIMESERIES", date: TRENDS_WINDOW, api_key: apiKey },
    fetchImpl,
  );
  return { keyword, trendsUrl: googleTrendsUrl(keyword), fetchedAt: new Date(), weeks: parseInterestOverTime(json) };
}

const Account = z.object({
  total_searches_left: z.number().optional(),
  plan_searches_left: z.number().optional(),
  plan_name: z.string().nullish(),
});

/** Searches left on the SerpApi account. Free: doesn't use a search. */
export async function searchesLeft(apiKey: string, fetchImpl: typeof fetch = fetch) {
  const parsed = Account.safeParse(await getJson("/account.json", { api_key: apiKey }, fetchImpl));
  if (!parsed.success) throw new SerpApiError("SerpApi returned an unexpected account response.", "bad_response");
  const left = parsed.data.total_searches_left ?? parsed.data.plan_searches_left;
  if (left === undefined) throw new SerpApiError("SerpApi didn't say how many searches are left.", "bad_response");
  return { left, plan: parsed.data.plan_name ?? null };
}
