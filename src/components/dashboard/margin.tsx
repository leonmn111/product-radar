// Margin spread & arbitrage, as shown on catalog cards and in the dossier.
// The numbers come from src/server/margins: a wholesale range from US Census
// retail gross margins, and an arbitrage rating from real captured store prices.

import type { ArbitrageRating } from "@/server/margins/engine";
import type { ProductDto } from "@/server/products/service";
import { formatDateTime, formatPrice } from "./format";

export type Margin = NonNullable<ProductDto["margin"]>;

const BADGE_STYLE: Record<ArbitrageRating, string> = {
  HIGH_ARBITRAGE:
    "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20",
  MODERATE: "bg-sky-50 text-sky-800 ring-sky-600/20 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-400/20",
  RETAIL_ONLY: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20",
};

const money = (amount: number, currency: string) => formatPrice(String(amount), currency);
const moneyRange = (low: number, high: number, currency: string) => `${money(low, currency)}–${money(high, currency)}`;
const pctRange = (low: number, high: number) => `${Math.round(low)}–${Math.round(high)}%`;

export function ArbitrageBadge({ arbitrage }: { arbitrage: Margin["arbitrage"] }) {
  return (
    <span
      title={arbitrage.summary}
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${BADGE_STYLE[arbitrage.rating]}`}
    >
      <span className="sr-only">Arbitrage rating: </span>
      {arbitrage.label}
    </span>
  );
}

/** Compact margin block for a catalog card. */
export function MarginSummary({ margin }: { margin: Margin }) {
  const c = margin.currency;
  return (
    <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-900/5 ring-inset dark:bg-zinc-800/40 dark:ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Est. gross margin</p>
        <ArbitrageBadge arbitrage={margin.arbitrage} />
      </div>
      <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
        {moneyRange(margin.grossSpread.low, margin.grossSpread.high, c)}{" "}
        <span className="font-normal text-zinc-600 dark:text-zinc-400">
          · {pctRange(margin.grossSpread.lowPct, margin.grossSpread.highPct)}
        </span>
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
        Wholesale est. {moneyRange(margin.wholesaleEstimate.low, margin.wholesaleEstimate.high, c)}
      </p>
    </div>
  );
}

const card = "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900";
const link =
  "font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-indigo-300 dark:decoration-indigo-500/50 dark:focus-visible:outline-indigo-400";

function StoreLink({ merchant, url }: { merchant: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={link}>
      {merchant}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}

/** Full margin & arbitrage panel for the dossier, with every source cited. */
export function MarginCard({ productId, margin }: { productId: string; margin: Margin | null }) {
  const headingId = `margin-${productId}`;
  if (!margin) {
    return (
      <section aria-labelledby={headingId} className={card}>
        <h3 id={headingId} className="text-sm font-semibold text-zinc-950 dark:text-white">
          Margin &amp; arbitrage
        </h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          No current retail price was found for this product, so margins can&apos;t be estimated.
        </p>
      </section>
    );
  }
  const c = margin.currency;
  const { arbitrage: a, benchmark: b } = margin;
  return (
    <section aria-labelledby={headingId} className={card}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 id={headingId} className="text-sm font-semibold text-zinc-950 dark:text-white">
          Margin &amp; arbitrage
        </h3>
        <ArbitrageBadge arbitrage={a} />
      </div>
      <p className="mt-2 max-w-3xl text-sm text-zinc-800 dark:text-zinc-200">{a.summary}</p>
      {a.buy && a.sell && a.resalePrice !== null && a.fees !== null && a.currency && (
        <ul className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          <li>
            Buy at <StoreLink merchant={a.buy.merchant} url={a.buy.url} />: {money(a.buy.price, a.currency)}, seen{" "}
            {formatDateTime(a.buy.observedAt)}
          </li>
          <li>
            Resale price: {money(a.resalePrice, a.currency)}, like <StoreLink merchant={a.sell.merchant} url={a.sell.url} />{" "}
            (seen {formatDateTime(a.sell.observedAt)}), less {money(a.fees, a.currency)} in marketplace fees
          </li>
        </ul>
      )}

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800/60">
          <dt className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Est. wholesale cost</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-white">
            {moneyRange(margin.wholesaleEstimate.low, margin.wholesaleEstimate.high, c)}
          </dd>
          <dd className="text-xs text-zinc-600 dark:text-zinc-400">per unit, if you stock it</dd>
        </div>
        <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800/60">
          <dt className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Gross margin spread</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-white">
            {moneyRange(margin.grossSpread.low, margin.grossSpread.high, c)}
          </dd>
          <dd className="text-xs text-zinc-600 dark:text-zinc-400">
            {pctRange(margin.grossSpread.lowPct, margin.grossSpread.highPct)} of the retail price
          </dd>
        </div>
        <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800/60">
          <dt className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Retail price used</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-white">
            {money(margin.retailPrice.price, c)}
          </dd>
          <dd className="text-xs text-zinc-600 dark:text-zinc-400">
            lowest current, at <StoreLink merchant={margin.retailPrice.merchant} url={margin.retailPrice.url} />
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
        Rule-based estimate, not a supplier quote. Wholesale range from the{" "}
        <a href={b.source.url} className={link}>
          US Census Bureau&apos;s retail gross margins (Excel)
        </a>{" "}
        for {b.storeType.charAt(0).toLowerCase() + b.storeType.slice(1)}, {b.years} ({b.grossMarginPct.low}–{b.grossMarginPct.high}%). Resale fees
        at{" "}
        <a href={a.feeSource.url} target="_blank" rel="noopener noreferrer" className={link}>
          eBay&apos;s standard US rate
          <span className="sr-only"> (opens in new tab)</span>
        </a>
        , 13.6% plus a small per-order fee. Shipping, taxes, returns and brand reselling rules aren&apos;t included.
      </p>
    </section>
  );
}
