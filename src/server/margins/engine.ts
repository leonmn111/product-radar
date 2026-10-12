// Margin spread & arbitrage engine — pure functions, no I/O, no clock, no LLM.
// Same inputs + same `asOf` date ⇒ identical output.
//
// Everything here is an ESTIMATE (CLAUDE.md Rule 4). It answers two separate
// questions from two kinds of evidence (methodology v1.0.0):
//
// 1. Stocking margin: if a shop bought this at wholesale and sold it at today's
//    lowest retail price, what would it keep? ProductRadar has no supplier
//    quotes, so the wholesale cost is a RANGE from US Census retail gross
//    margins for the store type that sells the category (benchmarks.ts):
//      retail      = lowest in-stock price seen in the last 30 days (the card's price)
//      wholesale   = retail × (1 − margin), for the lowest and highest 2018–2022 margin
//      spread      = retail − wholesale  (so spread % = the benchmark margin)
//    It describes the category, not this product: always say so where it's shown.
//
// 2. Arbitrage: is any store we captured selling it cheaply enough to resell at
//    another store's price, after marketplace fees? Real captured offers only:
//      current     = in stock or pre-order, seen in the last 30 days, latest per store
//      per currency with ≥ 2 stores:
//        buy       = the cheapest store
//        sell      = median price of the other stores
//        fees      = sell × 13.6% + per-order fee         (eBay US standard rate)
//        net       = sell − buy − fees,   return = net / buy
//      The currency with the highest net (compared in euros) is reported.
//      Prices in different currencies are never paired: VAT, duties and
//      shipping differ across borders.
//    HIGH_ARBITRAGE   return ≥ 25% and net ≥ €10
//    MODERATE         return ≥ 10% and net ≥ €3
//    RETAIL_ONLY      anything else, including a single store
//    (A currency the ECB doesn't publish is held to the same numbers in its own units.)

import type { Availability } from "@/generated/prisma/enums";
import { bestCurrentOffer, OFFER_MAX_AGE_DAYS } from "@/server/scoring/engine";
import { toEur, type FxRates } from "@/server/scoring/fx";
import {
  BENCHMARK_YEARS,
  CENSUS_GROSS_MARGIN_SOURCE,
  EBAY_FEE_SOURCE,
  RESALE_FEE,
  storeTypeFor,
  type SourceRef,
} from "./benchmarks";

export const MARGIN_METHODOLOGY_VERSION = "1.0.0";

const DAY_MS = 86_400_000;
const HIGH = { returnPct: 25, netEur: 10 };
const MODERATE = { returnPct: 10, netEur: 3 };

export type MarginOffer = {
  merchant: string;
  url: string;
  price: number;
  currency: string;
  availability: Availability;
  observedAt: Date;
  sourceEvidenceId: string;
  qualityScore: number; // of the evidence the offer was captured from
};

export type ArbitrageRating = "HIGH_ARBITRAGE" | "MODERATE" | "RETAIL_ONLY";

export const ARBITRAGE_LABEL: Record<ArbitrageRating, string> = {
  HIGH_ARBITRAGE: "High Arbitrage",
  MODERATE: "Moderate",
  RETAIL_ONLY: "Retail Only",
};

/** A captured price, with the evidence it came from. */
export type OfferRef = {
  merchant: string;
  url: string;
  price: number;
  currency: string;
  observedAt: string;
  evidenceId: string;
  qualityScore: number;
};

export type MarginInsight = {
  methodologyVersion: string;
  currency: string;
  retailPrice: OfferRef;
  wholesaleEstimate: { low: number; high: number };
  grossSpread: { low: number; high: number; lowPct: number; highPct: number };
  benchmark: {
    storeType: string;
    naicsCode: string | null;
    years: string;
    grossMarginPct: { low: number; high: number };
    source: SourceRef;
  };
  arbitrage: {
    rating: ArbitrageRating;
    label: string;
    summary: string;
    buy: OfferRef | null;
    sell: OfferRef | null; // the store whose price sets the resale reference (median of the others)
    resalePrice: number | null;
    fees: number | null;
    netProfit: number | null;
    returnPct: number | null; // net / buy, %
    currency: string | null;
    feeRule: string;
    feeSource: SourceRef;
  };
  caveats: string[];
};

const cents = (x: number) => Math.round(x * 100) / 100;
const oneDp = (x: number) => Math.round(x * 10) / 10;
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function ref(o: MarginOffer): OfferRef {
  return {
    merchant: o.merchant,
    url: o.url,
    price: o.price,
    currency: o.currency,
    observedAt: o.observedAt.toISOString(),
    evidenceId: o.sourceEvidenceId,
    qualityScore: o.qualityScore,
  };
}

export function resaleFee(salePrice: number) {
  const perOrder = salePrice <= RESALE_FEE.smallOrderMax ? RESALE_FEE.perOrderSmall : RESALE_FEE.perOrder;
  return cents(salePrice * RESALE_FEE.rate + perOrder);
}

/** Latest in-stock/pre-order offer per store, seen in the last 30 days. */
export function currentOffersByStore(offers: MarginOffer[], asOf: Date): MarginOffer[] {
  const latest = new Map<string, MarginOffer>();
  for (const o of offers) {
    if (o.availability !== "IN_STOCK" && o.availability !== "PREORDER") continue;
    const age = (asOf.getTime() - o.observedAt.getTime()) / DAY_MS;
    if (age < 0 || age > OFFER_MAX_AGE_DAYS) continue;
    const key = o.merchant.toLowerCase();
    const prev = latest.get(key);
    if (
      !prev ||
      o.observedAt > prev.observedAt ||
      (o.observedAt.getTime() === prev.observedAt.getTime() && o.sourceEvidenceId > prev.sourceEvidenceId)
    ) {
      latest.set(key, o);
    }
  }
  return [...latest.values()].sort((a, b) => a.merchant.localeCompare(b.merchant));
}

type Pair = { buy: MarginOffer; sell: MarginOffer; resalePrice: number; fees: number; net: number; returnPct: number; netEur: number };

/** The best buy-low / resell pair within one currency, or null with fewer than 2 stores. */
function bestPairIn(offers: MarginOffer[], fx: FxRates): Pair | null {
  if (offers.length < 2) return null;
  const sorted = [...offers].sort((a, b) => a.price - b.price || a.sourceEvidenceId.localeCompare(b.sourceEvidenceId));
  const buy = sorted[0];
  const others = sorted.slice(1);
  const resalePrice = cents(median(others.map((o) => o.price)));
  // The store quoted as the resale reference: the one whose price is closest to the median (lower on a tie).
  const sell = others.reduce((best, o) =>
    Math.abs(o.price - resalePrice) < Math.abs(best.price - resalePrice) ? o : best,
  );
  const fees = resaleFee(resalePrice);
  const net = cents(resalePrice - buy.price - fees);
  return {
    buy,
    sell,
    resalePrice,
    fees,
    net,
    returnPct: oneDp((net / buy.price) * 100),
    netEur: toEur(net, buy.currency, fx) ?? net,
  };
}

function rate(pair: Pair | null): ArbitrageRating {
  if (!pair) return "RETAIL_ONLY";
  if (pair.returnPct >= HIGH.returnPct && pair.netEur >= HIGH.netEur) return "HIGH_ARBITRAGE";
  if (pair.returnPct >= MODERATE.returnPct && pair.netEur >= MODERATE.netEur) return "MODERATE";
  return "RETAIL_ONLY";
}

function arbitrageSummary(rating: ArbitrageRating, pair: Pair | null, current: MarginOffer[]): string {
  if (!pair) {
    if (current.length <= 1) {
      return current.length === 1
        ? `Only one store's current price has been captured (${current[0].merchant}), so there's no price gap to resell.`
        : "No current in-stock prices have been captured, so there's no price gap to resell.";
    }
    return "The stores captured price it in different currencies. Cross-border gaps aren't counted, because tax, duties and shipping differ.";
  }
  const c = pair.buy.currency;
  const trade = `Buying at ${pair.buy.merchant} for ${money(pair.buy.price, c)} and reselling at ${money(pair.resalePrice, c)}`;
  if (rating === "RETAIL_ONLY") {
    return pair.net < 0
      ? `${trade} would lose ${money(-pair.net, c)} per unit after marketplace fees.`
      : `${trade} leaves ${money(pair.net, c)} per unit after marketplace fees: too thin to be worth it.`;
  }
  return `${trade} leaves about ${money(pair.net, c)} per unit (${pair.returnPct}% return) after marketplace fees, before shipping.`;
}

export const MARGIN_CAVEATS = [
  "The wholesale range is the US Census average gross margin for the store type that sells this category, not a supplier quote.",
  "Arbitrage only compares prices we captured from stores in the last 30 days, in the same currency.",
  "Shipping, taxes, returns and brand reselling rules are not included.",
];

/**
 * Margin spread and arbitrage rating for one product, or null when it has no
 * current retail price to work from.
 */
export function marginInsight(input: { category: string; offers: MarginOffer[]; asOf: Date; fx: FxRates }): MarginInsight | null {
  const retail = bestCurrentOffer(input.offers, input.asOf, input.fx);
  if (!retail) return null;

  const store = storeTypeFor(input.category);
  const gmLow = Math.min(...store.grossMarginPct);
  const gmHigh = Math.max(...store.grossMarginPct);
  const price = retail.price;

  const current = currentOffersByStore(input.offers, input.asOf);
  const byCurrency = new Map<string, MarginOffer[]>();
  for (const o of current) byCurrency.set(o.currency, [...(byCurrency.get(o.currency) ?? []), o]);
  const pair =
    [...byCurrency.keys()]
      .sort()
      .map((c) => bestPairIn(byCurrency.get(c)!, input.fx))
      .filter((p): p is Pair => p !== null)
      .sort((a, b) => b.netEur - a.netEur)[0] ?? null;
  const rating = rate(pair);

  return {
    methodologyVersion: MARGIN_METHODOLOGY_VERSION,
    currency: retail.currency,
    retailPrice: ref(retail),
    wholesaleEstimate: { low: cents(price * (1 - gmHigh / 100)), high: cents(price * (1 - gmLow / 100)) },
    grossSpread: { low: cents((price * gmLow) / 100), high: cents((price * gmHigh) / 100), lowPct: gmLow, highPct: gmHigh },
    benchmark: {
      storeType: store.name,
      naicsCode: store.naicsCode,
      years: `${BENCHMARK_YEARS[0]}–${BENCHMARK_YEARS.at(-1)}`,
      grossMarginPct: { low: gmLow, high: gmHigh },
      source: CENSUS_GROSS_MARGIN_SOURCE,
    },
    arbitrage: {
      rating,
      label: ARBITRAGE_LABEL[rating],
      summary: arbitrageSummary(rating, pair, current),
      buy: pair ? ref(pair.buy) : null,
      sell: pair ? ref(pair.sell) : null,
      resalePrice: pair?.resalePrice ?? null,
      fees: pair?.fees ?? null,
      netProfit: pair?.net ?? null,
      returnPct: pair?.returnPct ?? null,
      currency: pair?.buy.currency ?? null,
      feeRule: RESALE_FEE.description,
      feeSource: EBAY_FEE_SOURCE,
    },
    caveats: MARGIN_CAVEATS,
  };
}
