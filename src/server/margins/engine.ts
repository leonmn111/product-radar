// Price-gap (arbitrage) engine — pure functions, no I/O, no clock, no LLM.
// Same inputs + same `asOf` date ⇒ identical output.
//
// Everything here is an ESTIMATE (CLAUDE.md Rule 4), built only from real captured store prices
// (methodology v2.0.0). v1's stocking margin — a wholesale range taken from US Census retail gross
// margins — was removed in v2.0.0: a benchmark is not a supplier cost (CLAUDE.md Rule 6). The UK
// landed margin (supplier cost, VAT, platform fees) now comes from src/engine/margin.ts, through
// src/services/catalogMargin.ts.
//
//   retail        = lowest current price (the card's price): each store's newest capture from the
//                   last 30 days, if in stock or pre-order
//
// Arbitrage: is any store we captured selling it cheaply enough to resell at another store's price,
// after selling fees?
//      current     = each store's newest capture from the last 30 days, kept only if
//                    it is in stock or pre-order (v1.2.0: a store whose newest
//                    capture is sold out no longer falls back to an older one)
//      per currency with ≥ 2 stores:
//        buy       = the cheapest store
//        sell      = median price of the other stores
//        fees      = sell × rate + per-order fee, for two resale routes (v1.1.0):
//                      arbitrage          eBay US standard rate, 13.6% + 0.40
//                      arbitrageOwnStore  Shopify Payments Basic card rate,
//                                         2% + 0.25 in GBP, otherwise 2.9% + 0.30
//        net       = sell − buy − fees,   return = net / buy
//      Per route, the currency with the highest net (compared in euros) is reported.
//      Prices in different currencies are never paired: VAT, duties and
//      shipping differ across borders.
//    HIGH_ARBITRAGE   return ≥ 25% and net ≥ €10
//    MODERATE         return ≥ 10% and net ≥ €3
//    RETAIL_ONLY      anything else, including a single store
//    (A currency the ECB doesn't publish is held to the same numbers in its own units.)
//    The own-shop route leaves out advertising, which a new shop usually needs to
//    find buyers at that price; the UI and API say so.

import type { Availability } from "@/generated/prisma/enums";
import { bestCurrentOffer, currentOffers } from "@/server/scoring/engine";
import { toEur, type FxRates } from "@/server/scoring/fx";
import { MARKETPLACE_FEE, ownStoreFee, type FeeSchedule, type SourceRef } from "./benchmarks";

export const MARGIN_METHODOLOGY_VERSION = "2.0.0";

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

export type ResaleChannel = "MARKETPLACE" | "OWN_STORE";

export const CHANNEL_LABEL: Record<ResaleChannel, string> = {
  MARKETPLACE: "Resell on eBay",
  OWN_STORE: "Resell in your own shop",
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
  arbitrage: ArbitrageScenario; // resale on eBay
  arbitrageOwnStore: ArbitrageScenario; // resale through your own shop, at card fees
  caveats: string[];
};

export type ArbitrageScenario = {
  channel: ResaleChannel;
  channelLabel: string;
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

export function resaleFee(salePrice: number, fee: FeeSchedule = MARKETPLACE_FEE) {
  const perOrder = salePrice <= fee.smallOrderMax ? fee.perOrderSmall : fee.perOrder;
  return cents(salePrice * fee.rate + perOrder);
}

/** Each store's current offer (its newest capture, if in stock or pre-order), by store name. */
export function currentOffersByStore(offers: MarginOffer[], asOf: Date): MarginOffer[] {
  return currentOffers(offers, asOf).sort((a, b) => a.merchant.localeCompare(b.merchant));
}

/** A buy-low / resell pair within one currency. Fees are applied per resale route. */
type Pair = { buy: MarginOffer; sell: MarginOffer; resalePrice: number };
type Trade = Pair & { fee: FeeSchedule; fees: number; net: number; returnPct: number; netEur: number };

/** Buy at the cheapest store, resell at the median of the others; null with fewer than 2 stores. */
function pairIn(offers: MarginOffer[]): Pair | null {
  if (offers.length < 2) return null;
  const sorted = [...offers].sort((a, b) => a.price - b.price || a.sourceEvidenceId.localeCompare(b.sourceEvidenceId));
  const buy = sorted[0];
  const others = sorted.slice(1);
  const resalePrice = cents(median(others.map((o) => o.price)));
  // The store quoted as the resale reference: the one whose price is closest to the median (lower on a tie).
  const sell = others.reduce((best, o) =>
    Math.abs(o.price - resalePrice) < Math.abs(best.price - resalePrice) ? o : best,
  );
  return { buy, sell, resalePrice };
}

function trade(pair: Pair, fee: FeeSchedule, fx: FxRates): Trade {
  const fees = resaleFee(pair.resalePrice, fee);
  const net = cents(pair.resalePrice - pair.buy.price - fees);
  return {
    ...pair,
    fee,
    fees,
    net,
    returnPct: oneDp((net / pair.buy.price) * 100),
    netEur: toEur(net, pair.buy.currency, fx) ?? net,
  };
}

function rate(t: Trade | null): ArbitrageRating {
  if (!t) return "RETAIL_ONLY";
  if (t.returnPct >= HIGH.returnPct && t.netEur >= HIGH.netEur) return "HIGH_ARBITRAGE";
  if (t.returnPct >= MODERATE.returnPct && t.netEur >= MODERATE.netEur) return "MODERATE";
  return "RETAIL_ONLY";
}

const FEE_WORDS: Record<ResaleChannel, string> = { MARKETPLACE: "eBay fees", OWN_STORE: "card fees" };
const LEFT_OUT: Record<ResaleChannel, string> = { MARKETPLACE: "shipping", OWN_STORE: "shipping and advertising" };

function arbitrageSummary(channel: ResaleChannel, rating: ArbitrageRating, t: Trade | null, current: MarginOffer[]): string {
  if (!t) {
    if (current.length <= 1) {
      return current.length === 1
        ? `Only one store's current price has been captured (${current[0].merchant}), so there's no price gap to resell.`
        : "No current in-stock prices have been captured, so there's no price gap to resell.";
    }
    return "The stores captured price it in different currencies. Cross-border gaps aren't counted, because tax, duties and shipping differ.";
  }
  const c = t.buy.currency;
  const deal = `Buying at ${t.buy.merchant} for ${money(t.buy.price, c)} and reselling at ${money(t.resalePrice, c)}`;
  if (rating === "RETAIL_ONLY") {
    return t.net < 0
      ? `${deal} would lose ${money(-t.net, c)} per unit after ${FEE_WORDS[channel]}.`
      : `${deal} leaves ${money(t.net, c)} per unit after ${FEE_WORDS[channel]}: too thin to be worth it.`;
  }
  return `${deal} leaves about ${money(t.net, c)} per unit (${t.returnPct}% return) after ${FEE_WORDS[channel]}, before ${LEFT_OUT[channel]}.`;
}

/** One resale route: the best same-currency trade after that route's fees. */
function scenario(
  channel: ResaleChannel,
  feeFor: (currency: string) => FeeSchedule,
  pairs: Pair[],
  current: MarginOffer[],
  retailCurrency: string,
  fx: FxRates,
): ArbitrageScenario {
  const best = pairs.map((p) => trade(p, feeFor(p.buy.currency), fx)).sort((a, b) => b.netEur - a.netEur)[0] ?? null;
  const rating = rate(best);
  const fee = best?.fee ?? feeFor(retailCurrency);
  return {
    channel,
    channelLabel: CHANNEL_LABEL[channel],
    rating,
    label: ARBITRAGE_LABEL[rating],
    summary: arbitrageSummary(channel, rating, best, current),
    buy: best ? ref(best.buy) : null,
    sell: best ? ref(best.sell) : null,
    resalePrice: best?.resalePrice ?? null,
    fees: best?.fees ?? null,
    netProfit: best?.net ?? null,
    returnPct: best?.returnPct ?? null,
    currency: best?.buy.currency ?? null,
    feeRule: fee.description,
    feeSource: fee.source,
  };
}

export const MARGIN_CAVEATS = [
  "Arbitrage only compares prices we captured from stores in the last 30 days, in the same currency.",
  "Shipping, taxes, returns and brand reselling rules are not included.",
  "The own-shop route leaves out advertising and the shop's monthly plan, which you'll usually need to find buyers at that price.",
];

/**
 * The retail price and the two arbitrage ratings for one product, or null when it has no
 * current retail price to work from.
 */
export function marginInsight(input: { offers: MarginOffer[]; asOf: Date; fx: FxRates }): MarginInsight | null {
  const retail = bestCurrentOffer(input.offers, input.asOf, input.fx);
  if (!retail) return null;

  const current = currentOffersByStore(input.offers, input.asOf);
  const byCurrency = new Map<string, MarginOffer[]>();
  for (const o of current) byCurrency.set(o.currency, [...(byCurrency.get(o.currency) ?? []), o]);
  const pairs = [...byCurrency.keys()]
    .sort()
    .map((c) => pairIn(byCurrency.get(c)!))
    .filter((p): p is Pair => p !== null);

  return {
    methodologyVersion: MARGIN_METHODOLOGY_VERSION,
    currency: retail.currency,
    retailPrice: ref(retail),
    arbitrage: scenario("MARKETPLACE", () => MARKETPLACE_FEE, pairs, current, retail.currency, input.fx),
    arbitrageOwnStore: scenario("OWN_STORE", ownStoreFee, pairs, current, retail.currency, input.fx),
    caveats: MARGIN_CAVEATS,
  };
}
