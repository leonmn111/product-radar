// Margin spread & arbitrage, as shown on catalog cards and in the dossier.
// The numbers come from src/server/margins: a wholesale range from US Census
// retail gross margins, and two arbitrage ratings from real captured store
// prices: reselling on eBay, and reselling in your own shop at card fees.

import type { ArbitrageRating, ArbitrageScenario } from "@/server/margins/engine";
import type { ProductDto } from "@/server/products/service";
import { formatDateTime, formatPrice } from "./format";

export type Margin = NonNullable<ProductDto["margin"]>;

const BADGE_STYLE: Record<ArbitrageRating, string> = {
  HIGH_ARBITRAGE:
    "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20",
  MODERATE: "bg-sky-50 text-sky-800 ring-sky-600/20 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-400/20",
  RETAIL_ONLY: "bg-gray-100 text-slate-700 ring-slate-500/20 dark:bg-surface-raised dark:text-slate-300 dark:ring-slate-400/20",
};

const money = (amount: number, currency: string) => formatPrice(String(amount), currency);
const moneyRange = (low: number, high: number, currency: string) => `${money(low, currency)}–${money(high, currency)}`;
const pctRange = (low: number, high: number) => `${Math.round(low)}–${Math.round(high)}%`;

const SHORT_CHANNEL: Record<ArbitrageScenario["channel"], string> = { MARKETPLACE: "eBay", OWN_STORE: "Own shop" };

export function ArbitrageBadge({ scenario }: { scenario: ArbitrageScenario }) {
  return (
    <span
      title={scenario.summary}
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${BADGE_STYLE[scenario.rating]}`}
    >
      <span className="sr-only">Arbitrage rating: </span>
      {scenario.label}
    </span>
  );
}

/** Compact margin block for a catalog card. */
export function MarginSummary({ margin }: { margin: Margin }) {
  const c = margin.currency;
  return (
    <div className="rounded-lg bg-gray-50 p-3 ring-1 ring-line-dark/5 ring-inset dark:bg-surface-raised/40 dark:ring-white/10">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Est. gross margin</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
        {moneyRange(margin.grossSpread.low, margin.grossSpread.high, c)}{" "}
        <span className="font-normal text-slate-600 dark:text-slate-400">
          · {pctRange(margin.grossSpread.lowPct, margin.grossSpread.highPct)}
        </span>
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-slate-600 dark:text-slate-400">
        Wholesale est. {moneyRange(margin.wholesaleEstimate.low, margin.wholesaleEstimate.high, c)}
      </p>
      <dl className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-gray-200 pt-2 dark:border-line-dark/60">
        {[margin.arbitrage, margin.arbitrageOwnStore].map((s) => (
          <div key={s.channel} className="flex items-center gap-1.5">
            <dt className="text-xs text-slate-600 dark:text-slate-400">{SHORT_CHANNEL[s.channel]}</dt>
            <dd>
              <ArbitrageBadge scenario={s} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const card = "rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-line-dark dark:bg-surface-dark";
const link =
  "font-medium text-accent-mint underline decoration-accent-mint/40 underline-offset-2 hover:decoration-accent-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";

function StoreLink({ merchant, url }: { merchant: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={link}>
      {merchant}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}

/** One resale route in the dossier: its rating, why, the trade behind it and the fee it assumes. */
function ScenarioPanel({ scenario: s }: { scenario: ArbitrageScenario }) {
  return (
    <div className="rounded-lg p-3 ring-1 ring-gray-200 ring-inset dark:ring-line-dark">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{s.channelLabel}</h4>
        <ArbitrageBadge scenario={s} />
      </div>
      <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">{s.summary}</p>
      {s.buy && s.sell && s.resalePrice !== null && s.fees !== null && s.currency && (
        <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
          <li>
            Buy at <StoreLink merchant={s.buy.merchant} url={s.buy.url} />: {money(s.buy.price, s.currency)}, seen{" "}
            {formatDateTime(s.buy.observedAt)}
          </li>
          <li>
            Resale price: {money(s.resalePrice, s.currency)}, like <StoreLink merchant={s.sell.merchant} url={s.sell.url} />{" "}
            (seen {formatDateTime(s.sell.observedAt)}), less {money(s.fees, s.currency)} in fees
          </li>
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
        Fees: {s.feeRule} (
        <a href={s.feeSource.url} target="_blank" rel="noopener noreferrer" className={link}>
          source
          <span className="sr-only">: {s.feeSource.name} (opens in new tab)</span>
        </a>
        )
      </p>
    </div>
  );
}

/** Full margin & arbitrage panel for the dossier, with every source cited. */
export function MarginCard({ productId, margin }: { productId: string; margin: Margin | null }) {
  const headingId = `margin-${productId}`;
  if (!margin) {
    return (
      <section aria-labelledby={headingId} className={card}>
        <h3 id={headingId} className="text-sm font-semibold text-slate-900 dark:text-white">
          Margin &amp; arbitrage
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          No current retail price was found for this product, so margins can&apos;t be estimated.
        </p>
      </section>
    );
  }
  const c = margin.currency;
  const b = margin.benchmark;
  return (
    <section aria-labelledby={headingId} className={card}>
      <h3 id={headingId} className="text-sm font-semibold text-slate-900 dark:text-white">
        Margin &amp; arbitrage
      </h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ScenarioPanel scenario={margin.arbitrage} />
        <ScenarioPanel scenario={margin.arbitrageOwnStore} />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-gray-100 p-3 dark:bg-surface-raised/60">
          <dt className="text-xs font-medium text-slate-700 dark:text-slate-300">Est. wholesale cost</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
            {moneyRange(margin.wholesaleEstimate.low, margin.wholesaleEstimate.high, c)}
          </dd>
          <dd className="text-xs text-slate-600 dark:text-slate-400">per unit, if you stock it</dd>
        </div>
        <div className="rounded-lg bg-gray-100 p-3 dark:bg-surface-raised/60">
          <dt className="text-xs font-medium text-slate-700 dark:text-slate-300">Gross margin spread</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
            {moneyRange(margin.grossSpread.low, margin.grossSpread.high, c)}
          </dd>
          <dd className="text-xs text-slate-600 dark:text-slate-400">
            {pctRange(margin.grossSpread.lowPct, margin.grossSpread.highPct)} of the retail price
          </dd>
        </div>
        <div className="rounded-lg bg-gray-100 p-3 dark:bg-surface-raised/60">
          <dt className="text-xs font-medium text-slate-700 dark:text-slate-300">Retail price used</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
            {money(margin.retailPrice.price, c)}
          </dd>
          <dd className="text-xs text-slate-600 dark:text-slate-400">
            lowest current, at <StoreLink merchant={margin.retailPrice.merchant} url={margin.retailPrice.url} />
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        Rule-based estimate, not a supplier quote. Wholesale range from the{" "}
        <a href={b.source.url} className={link}>
          US Census Bureau&apos;s retail gross margins (Excel)
        </a>{" "}
        for {b.storeType.charAt(0).toLowerCase() + b.storeType.slice(1)}, {b.years} ({b.grossMarginPct.low}–{b.grossMarginPct.high}%).
        Shipping, taxes, returns and brand reselling rules aren&apos;t included. Your own shop also needs advertising and a
        monthly plan to find buyers at that price, and those aren&apos;t included either.
      </p>
    </section>
  );
}
