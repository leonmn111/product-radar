// The live-search answer as the site shows it: each opportunity with its margin breakdown,
// confidence and every cited listing; then what was withheld under the 0.7 gate and why.
// Server component: it only renders what runLiveSearch returned (nothing is computed here).

import { formatDateTime } from "@/components/dashboard/format";
import type { LiveOpportunity, LiveSearchResult, Withheld } from "@/server/live/search";
import { MARKET_NAME, MARKETS } from "@/server/live/types";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(currency === "GBP" ? "en-GB" : "en-US", { style: "currency", currency }).format(amount);
const pct = (x: number) => `${Math.round(x * 100)}%`;

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const link = `rounded-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-accent-mint dark:text-slate-100 dark:decoration-slate-600 ${focusRing}`;
const tile = "rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-surface-dark dark:ring-white/10";

function ConfidencePill({ c }: { c: LiveOpportunity["confidence"] }) {
  return (
    <span
      title={`Amazon side ${pct(c.retail)}, supplier side ${pct(c.supplier)}; a result needs 70% on both`}
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
    >
      {pct(c.overall)} confidence
      <span className="font-normal text-emerald-700/80 dark:text-emerald-300/70">
        · Amazon {pct(c.retail)} · supplier {pct(c.supplier)}
      </span>
    </span>
  );
}

function MarginBlock({ o }: { o: LiveOpportunity }) {
  const m = o.margin;
  const rows: [string, string][] = [
    [`Selling price (median of ${o.retail.listings.length} listings)`, money(m.sellingPrice, m.currency)],
    [`Supplier unit price (median of ${o.suppliers.length})`, money(m.supplierUnitCost, m.currency)],
    [`Shipping to ${MARKET_NAME[o.market]}`, m.shippingCost === null ? "not quoted" : money(m.shippingCost, m.currency)],
    ["Landed cost", money(m.landedCost, m.currency)],
  ];
  return (
    <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-line-dark/5 ring-inset dark:bg-white/[0.03] dark:ring-white/10">
      <p className="text-xs font-medium text-slate-400 dark:text-slate-400">{m.label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`text-3xl font-bold tracking-tight whitespace-nowrap tabular-nums ${m.spread >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
          {m.spread >= 0 ? "+" : "−"}
          {money(Math.abs(m.spread), m.currency)}
        </span>
        <span className="text-sm text-slate-600 dark:text-slate-400">per unit · {m.spreadPct}% of the price</span>
      </p>
      <dl className="mt-3 space-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-slate-600 dark:text-slate-400">{k}</dt>
            <dd className={`tabular-nums ${v === "not quoted" ? "text-slate-400 italic" : "font-medium text-slate-900 dark:text-slate-50"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
        Not included:
        {m.notIncluded.map((n) => (
          <span key={n} className="rounded-full bg-white px-2 py-0.5 ring-1 ring-gray-200 dark:bg-white/5 dark:ring-white/10">
            {n}
          </span>
        ))}
      </p>
      {m.exchangeRate && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-400">
          Converted at the{" "}
          <a href={m.exchangeRate.url} target="_blank" rel="noopener noreferrer" className={link}>
            ECB reference rate
            <span className="sr-only"> (opens in new tab)</span>
          </a>{" "}
          of {m.exchangeRate.date}.
        </p>
      )}
    </div>
  );
}

function Opportunity({ o }: { o: LiveOpportunity }) {
  return (
    <article className={`${tile} flex flex-col gap-4 p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">{MARKETS[o.market].label}</span>
        <ConfidencePill c={o.confidence} />
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">{o.title}</h3>
      <MarginBlock o={o} />
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Amazon listings">
          <h4 className="text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-400">Amazon listings ({o.retail.listings.length})</h4>
          <ul className="mt-2 space-y-2 text-sm">
            {o.retail.listings.map((l) => (
              <li key={l.evidence.id} className="text-slate-600 dark:text-slate-400">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className={link}>
                  {money(l.price.amount, l.price.currency)} · {l.title.slice(0, 60)}
                  {l.title.length > 60 ? "…" : ""}
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
                <br />
                <span className="text-xs">
                  {[l.rating !== null && l.ratingsTotal !== null ? `${l.rating}/5 from ${l.ratingsTotal.toLocaleString("en-US")} ratings` : null, l.recentSales, `seen ${formatDateTime(l.evidence.observedAt)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Supplier matches">
          <h4 className="text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-400">Supplier matches ({o.suppliers.length})</h4>
          <ul className="mt-2 space-y-2 text-sm">
            {o.suppliers.map(({ offer, match }) => (
              <li key={offer.evidence.id} className="text-slate-600 dark:text-slate-400">
                <a href={offer.url} target="_blank" rel="noopener noreferrer" className={link}>
                  {money(offer.unitPrice.amount, offer.unitPrice.currency)} · {offer.title.slice(0, 60)}
                  {offer.title.length > 60 ? "…" : ""}
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
                <br />
                <span className="text-xs">
                  {pct(match)} title match · {offer.evidence.provider} · seen {formatDateTime(offer.evidence.observedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

function WithheldList({ items }: { items: Withheld[] }) {
  if (!items.length) return null;
  return (
    <details className={`${tile} group p-5 sm:p-6`}>
      <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-md font-semibold text-slate-900 dark:text-slate-50 ${focusRing} [&::-webkit-details-marker]:hidden`}>
        Withheld under the 0.7 confidence gate ({items.length})
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180 motion-reduce:transition-none">
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </summary>
      <ul className="mt-4 divide-y divide-gray-200 dark:divide-white/10">
        {items.map((w) => (
          <li key={`${w.market}:${w.title}`} className="py-3 text-sm">
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {w.title}{" "}
              <span className="font-normal text-slate-400 dark:text-slate-400">
                · {MARKETS[w.market].label} · {pct(w.confidence)} confidence
              </span>
            </p>
            <p className="mt-1 text-slate-600 dark:text-slate-400">Needs: {w.missing.join("; ")}.</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function LiveResults({ result }: { result: LiveSearchResult }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {result.results.length} result{result.results.length === 1 ? "" : "s"} · {result.withheld.length} withheld ·{" "}
        {result.usage.providerCalls} provider call{result.usage.providerCalls === 1 ? "" : "s"} · {formatDateTime(result.generatedAt)}
      </p>
      {result.sourceErrors.length > 0 && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-rose-600/20 ring-inset dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">
          Some sources didn&apos;t answer, so their evidence is missing: {result.sourceErrors.join("; ")}.
        </p>
      )}
      {result.results.length === 0 && (
        <p className={`${tile} p-6 text-sm text-slate-700 dark:text-slate-300`}>
          Nothing cleared the 0.7 confidence gate for this search. Rather than show a guess, the withheld products are listed
          below with the evidence each one still needs.
        </p>
      )}
      {result.results.map((o) => (
        <Opportunity key={`${o.market}:${o.title}`} o={o} />
      ))}
      <WithheldList items={result.withheld} />
      <p className="text-xs text-slate-400 dark:text-slate-400">
        {result.disclaimer} Not applied yet: {result.notYetApplied.join("; ")}.
      </p>
    </div>
  );
}
