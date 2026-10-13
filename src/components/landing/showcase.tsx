"use client";

// The landing page's live showcase: one or two real products, each as a clickable
// card beside what its price gap is worth on both resale routes. Every number comes
// straight from the margin engine's output for captured store prices (Rule 3), and
// every price links to the store page it was read from.

import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { ArbitrageScenario, OfferRef } from "@/server/margins/engine";
import type { ProductDto } from "@/server/products/service";
import { dossierHref, formatDateTime, formatPrice } from "../dashboard/format";
import { ArbitrageBadge } from "../dashboard/margin";
import { ProductCard } from "../dashboard/product-card";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400";
const link =
  "font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-600 dark:text-indigo-300 dark:decoration-indigo-500/50 " +
  focusRing;

const money = (amount: number, currency: string) => formatPrice(String(amount), currency);

const ROUTE_NAME: Record<ArbitrageScenario["channel"], string> = { MARKETPLACE: "eBay", OWN_STORE: "Your own shop" };
const ROUTE_FEES: Record<ArbitrageScenario["channel"], string> = { MARKETPLACE: "eBay fees", OWN_STORE: "Card fees" };

/** A route with a complete trade to show (both stores, fees and a result). */
type Trade = ArbitrageScenario & { buy: OfferRef; sell: OfferRef; resalePrice: number; fees: number; netProfit: number; currency: string };
const isTrade = (s: ArbitrageScenario): s is Trade =>
  s.buy !== null && s.sell !== null && s.resalePrice !== null && s.fees !== null && s.netProfit !== null && s.currency !== null;

function Seen({ offer }: { offer: OfferRef }) {
  return (
    <span className="text-zinc-500 dark:text-zinc-400">
      seen {formatDateTime(offer.observedAt)} · quality {offer.qualityScore}/100
    </span>
  );
}

function StoreLink({ offer }: { offer: OfferRef }) {
  return (
    <a href={offer.url} target="_blank" rel="noopener noreferrer" className={link}>
      {offer.merchant}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}

/** Where the trade's two prices come from: the cheapest store, and the going price elsewhere. */
function PriceGap({ trade: t }: { trade: Trade }) {
  return (
    <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
      <li>
        <span className="font-semibold text-zinc-950 dark:text-white">Buy at {money(t.buy.price, t.currency)}</span> from{" "}
        <StoreLink offer={t.buy} /> <Seen offer={t.buy} />
      </li>
      <li>
        <span className="font-semibold text-zinc-950 dark:text-white">Resell at {money(t.resalePrice, t.currency)}</span>, the
        going price at other stores, like <StoreLink offer={t.sell} /> <Seen offer={t.sell} />
      </li>
    </ul>
  );
}

/** The resale price split into stock cost, fees and what's left; a loss shows costs running past it. */
function SplitBar({ trade: t }: { trade: Trade }) {
  const c = t.currency;
  const loss = t.netProfit < 0;
  const total = loss ? t.buy.price + t.fees : t.resalePrice;
  const pct = (x: number) => `${Math.max(0, (x / total) * 100)}%`;
  const label = loss
    ? `Buying at ${money(t.buy.price, c)} plus ${money(t.fees, c)} in fees costs more than the ${money(t.resalePrice, c)} resale price.`
    : `Of the ${money(t.resalePrice, c)} resale price, ${money(t.buy.price, c)} buys the stock, ${money(t.fees, c)} goes in fees and ${money(t.netProfit, c)} is yours.`;
  const grow = "h-full transition-[width] duration-500 ease-out motion-reduce:transition-none";
  return (
    <div>
      <div role="img" aria-label={label} className="relative flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <span className={`${grow} bg-zinc-400 dark:bg-zinc-500`} style={{ width: pct(t.buy.price) }} />
        <span className={`${grow} bg-amber-400 dark:bg-amber-500`} style={{ width: pct(t.fees) }} />
        <span className={`${grow} bg-emerald-500 dark:bg-emerald-400`} style={{ width: pct(Math.max(t.netProfit, 0)) }} />
        {loss && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5 bg-rose-600 transition-[left] duration-500 motion-reduce:transition-none dark:bg-rose-400"
            style={{ left: pct(t.resalePrice) }}
          />
        )}
      </div>
      <ul aria-hidden="true" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-zinc-400 dark:bg-zinc-500" />
          Stock {money(t.buy.price, c)}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-400 dark:bg-amber-500" />
          {ROUTE_FEES[t.channel]} {money(t.fees, c)}
        </li>
        {loss ? (
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-0.5 bg-rose-600 dark:bg-rose-400" />
            Resale {money(t.resalePrice, c)}
          </li>
        ) : (
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            Yours {money(t.netProfit, c)}
          </li>
        )}
      </ul>
    </div>
  );
}

function RouteCard({ scenario: s, showTrade }: { scenario: ArbitrageScenario; showTrade: boolean }) {
  const t = isTrade(s) ? s : null;
  const loss = t !== null && t.netProfit < 0;
  return (
    <section
      aria-label={s.channelLabel}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">{ROUTE_NAME[s.channel]}</h4>
        <ArbitrageBadge scenario={s} />
      </div>
      {t ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`text-3xl font-semibold tracking-tight tabular-nums ${
                loss ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"
              }`}
            >
              {loss ? "−" : "+"}
              {money(Math.abs(t.netProfit), t.currency)}
            </span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {loss ? "lost" : "kept"} per unit · {String(t.returnPct).replace("-", "−")}% return
            </span>
          </p>
          <SplitBar trade={t} />
          {showTrade && <PriceGap trade={t} />}
        </>
      ) : (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{s.summary}</p>
      )}
      <p className="mt-auto text-xs text-zinc-600 dark:text-zinc-400">
        Fees: {s.feeRule} (
        <a href={s.feeSource.url} target="_blank" rel="noopener noreferrer" className={link}>
          source
          <span className="sr-only">: {s.feeSource.name} (opens in new tab)</span>
        </a>
        )
      </p>
    </section>
  );
}

function sameTrade(a: ArbitrageScenario, b: ArbitrageScenario) {
  return a.buy?.evidenceId === b.buy?.evidenceId && a.sell?.evidenceId === b.sell?.evidenceId;
}

/** "Your own shop keeps £2.47 more per unit than eBay", when both routes price the same trade. */
function Difference({ ebay, own }: { ebay: ArbitrageScenario; own: ArbitrageScenario }) {
  if (!isTrade(ebay) || !isTrade(own) || ebay.currency !== own.currency) return null;
  const diff = Math.round((own.netProfit - ebay.netProfit) * 100) / 100;
  if (diff === 0) return null;
  const better = diff > 0 ? "your own shop" : "eBay";
  return (
    <p className="text-base font-medium text-zinc-950 dark:text-white">
      Same price gap, two results: {better} keeps{" "}
      <span className="font-semibold text-indigo-700 tabular-nums dark:text-indigo-300">{money(Math.abs(diff), own.currency)}</span>{" "}
      more per unit.
    </p>
  );
}

function ProductPanel({ product: p }: { product: ProductDto }) {
  const m = p.margin;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-8">
      <ul className="mx-auto w-full max-w-sm lg:max-w-none">
        <ProductCard product={p} href={dossierHref(p)} />
      </ul>
      <div className="flex min-w-0 flex-col gap-4">
        {m ? (
          <>
            <Difference ebay={m.arbitrage} own={m.arbitrageOwnStore} />
            {sameTrade(m.arbitrage, m.arbitrageOwnStore) && isTrade(m.arbitrage) && (
              <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-900/5 ring-inset dark:bg-zinc-800/40 dark:ring-white/10">
                <h4 className="text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">The price gap</h4>
                <div className="mt-2">
                  <PriceGap trade={m.arbitrage} />
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <RouteCard scenario={m.arbitrage} showTrade={!sameTrade(m.arbitrage, m.arbitrageOwnStore)} />
              <RouteCard scenario={m.arbitrageOwnStore} showTrade={!sameTrade(m.arbitrage, m.arbitrageOwnStore)} />
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">No current retail price was found for this product.</p>
        )}
        <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Rule-based estimate from captured store prices, not a guarantee. Shipping, VAT and returns aren&apos;t
            included, and a new shop usually needs advertising too.
          </p>
          <Link
            href={dossierHref(p)}
            className={`group inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 active:scale-[0.98] motion-reduce:transition-none dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 ${focusRing}`}
          >
            Open the full dossier
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
              →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

const shortName = (p: ProductDto) => p.name.replace(/\s*\(.*?\)\s*/g, " ").trim();

export function Showcase({ products }: { products: ProductDto[] }) {
  const [active, setActive] = useState(0);
  const ids = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const product = products[Math.min(active, products.length - 1)];

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onKey(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = (active + (e.key === "ArrowRight" ? 1 : products.length - 1)) % products.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  if (products.length === 1) return <ProductPanel product={product} />;
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Showcase products" onKeyDown={onKey} className="grid grid-cols-2 gap-2 sm:inline-grid sm:auto-cols-fr sm:grid-flow-col">
        {products.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={`${ids}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls={`${ids}-panel`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={`min-w-0 rounded-lg px-3 py-2 text-left text-sm font-medium ring-1 ring-inset transition active:scale-[0.98] motion-reduce:transition-none sm:max-w-64 ${focusRing} ${
              i === active
                ? "bg-zinc-900 text-white ring-zinc-900 dark:bg-white dark:text-zinc-900 dark:ring-white"
                : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            <span className="block truncate">{shortName(p)}</span>
            {p.brand && (
              <span className={`block truncate text-xs ${i === active ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-500 dark:text-zinc-400"}`}>
                {p.brand}
              </span>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${active}`}>
        <ProductPanel product={product} />
      </div>
    </div>
  );
}
