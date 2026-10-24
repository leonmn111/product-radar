// Resale price gaps, as shown on catalog cards and in the dossier. The numbers come from
// src/server/margins: two arbitrage ratings from real captured store prices only (reselling on eBay,
// and reselling in your own shop at card fees). The UK landed margin is landed-margin.tsx.

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

/** Compact price-gap block for a catalog card. */
export function MarginSummary({ margin }: { margin: Margin }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 ring-1 ring-line-dark/5 ring-inset dark:bg-surface-raised/40 dark:ring-white/10">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Resale price gap, after fees</p>
      <dl className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
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

/** The two resale routes for the dossier, with every source cited. */
export function MarginCard({ productId, margin }: { productId: string; margin: Margin | null }) {
  const headingId = `margin-${productId}`;
  return (
    <section aria-labelledby={headingId} className={card}>
      <h3 id={headingId} className="text-sm font-semibold text-slate-900 dark:text-white">
        Resale price gaps
      </h3>
      {margin ? (
        <>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Buying at one store and reselling at the others&apos; going price, after selling fees.</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <ScenarioPanel scenario={margin.arbitrage} />
            <ScenarioPanel scenario={margin.arbitrageOwnStore} />
          </div>
          <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
            From store prices captured in the last 30 days, in the same currency only. Shipping, taxes and returns
            aren&apos;t included. Your own shop also needs advertising and a monthly plan to find buyers at that price, and
            those aren&apos;t included either.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No current retail price was found for this product, so there&apos;s no price gap to show.</p>
      )}
    </section>
  );
}
