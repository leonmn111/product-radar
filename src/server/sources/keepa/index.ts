// Keepa API adapter (Amazon price and sales-rank history), for Momentum's 12-week slope. Phase 2.
// One product request = 1 Keepa token. The key travels in the query string, so request URLs are
// never logged. SCAFFOLD: no key is configured yet (Keepa is a paid plan the owner hasn't approved);
// it's tested against a made-up response in Keepa's official format (fixtures/SAMPLE-not-real-*).

import { dailySeries, type TimePoint } from "@/engine/trend";
import type { QueryBudget } from "@/server/live/budget";
import type { Evidence, ProductHistory } from "@/server/live/types";
import { SourceError, type HistorySource } from "../types";
import { CSV_TYPE, KEEPA_DOMAIN, keepaMinuteToDate, type KeepaProductResponse } from "./types";

const ENDPOINT = "https://api.keepa.com/product";
const MAX_CALL_MS = 20_000;
export const HISTORY_DAYS = 90;
// Amazon's own figures, collected and dated by a data provider (as Rainforest's are).
export const KEEPA_QUALITY = 80;

/** 90 days of one product's history, one value per UTC day, with its evidence. */
export type KeepaHistory = ProductHistory & {
  domain: typeof KEEPA_DOMAIN.GB;
  salesRank: TimePoint[]; // best-sellers rank in the main category; lower is better
  newPrice: TimePoint[]; // lowest new price, in pence
  evidence: Evidence;
};

/** Keepa's flat [time, value, time, value, …] history as dated changes; -1 (no rank / no offer) is unknown. */
function changes(flat: number[] | null | undefined) {
  const out: { at: number; value: number | null }[] = [];
  if (!flat) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push({ at: keepaMinuteToDate(flat[i]).getTime(), value: flat[i + 1] < 0 ? null : flat[i + 1] });
  }
  return out;
}

/** Pure: a Keepa product response → the 90-day SALES and NEW histories. Null when Keepa has no usable product. */
export function parseKeepaHistory(json: KeepaProductResponse, asin: string, now: Date): KeepaHistory | null {
  const p = json.products?.find((x) => x.asin === asin);
  if (!p || p.productType !== 0 || p.domainId !== KEEPA_DOMAIN.GB) return null;
  const updated = keepaMinuteToDate(p.lastUpdate);
  const to = updated.getTime() > now.getTime() ? now : updated;
  const from = new Date(to.getTime() - HISTORY_DAYS * 86_400_000);
  const salesRank = dailySeries(changes(p.csv?.[CSV_TYPE.SALES]), from, to);
  const newPrice = dailySeries(changes(p.csv?.[CSV_TYPE.NEW]), from, to);
  const sourceUrl = `https://keepa.com/#!product/${KEEPA_DOMAIN.GB}-${asin}`;
  return {
    asin,
    domain: KEEPA_DOMAIN.GB,
    from: from.toISOString(),
    to: to.toISOString(),
    salesRank,
    newPrice,
    evidence: {
      id: `keepa:${KEEPA_DOMAIN.GB}:${asin}`,
      provider: "keepa",
      sourceUrl,
      observedAt: to.toISOString(),
      quality: KEEPA_QUALITY,
      claim: `Amazon UK sales-rank and new-price history for ${asin}, ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}: ${salesRank.length} days of rank, ${newPrice.length} days of price (Keepa).`,
    },
  };
}

/**
 * The last 90 days of Amazon UK sales rank (SALES) and lowest new price (NEW) for one ASIN.
 * `domain` must be 2: Keepa's id for amazon.co.uk (3 is amazon.de). Spends one call from the budget;
 * throws SourceError when Keepa refuses (bad key, out of tokens) or can't be reached.
 */
export async function fetchKeepaHistory(
  asin: string,
  domain: typeof KEEPA_DOMAIN.GB,
  deps: { apiKey: string; budget: QueryBudget; fetchImpl?: typeof fetch; now?: () => Date },
): Promise<KeepaHistory | null> {
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new SourceError("keepa", `not an ASIN: ${asin}`);
  deps.budget.spendCall();
  const params = new URLSearchParams({ key: deps.apiKey, domain: String(domain), asin, history: "1", days: String(HISTORY_DAYS) });
  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(Math.min(MAX_CALL_MS, deps.budget.remainingMs())) });
  } catch (e) {
    throw new SourceError("keepa", e instanceof Error && e.name === "TimeoutError" ? "timed out" : "network error");
  }
  const json = (await res.json().catch(() => null)) as KeepaProductResponse | null;
  if (!res.ok || !json || json.error) {
    const why = res.status === 429 ? "out of tokens" : res.status === 402 ? "the API key has no access" : `HTTP ${res.status}`;
    throw new SourceError("keepa", json?.error?.message ? `${why}: ${json.error.message}` : why);
  }
  return parseKeepaHistory(json, asin, (deps.now ?? (() => new Date()))());
}

/** Keepa as the Dossier's history source (Amazon UK). */
export function createKeepaSource({ apiKey, fetchImpl, now }: { apiKey: string; fetchImpl?: typeof fetch; now?: () => Date }): HistorySource {
  return { name: "keepa", history: (asin, budget) => fetchKeepaHistory(asin, KEEPA_DOMAIN.GB, { apiKey, budget, fetchImpl, now }) };
}
