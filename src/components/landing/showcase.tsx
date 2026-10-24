"use client";

// The landing page's live showcase: one or two real products as a bento grid, each a
// clickable card beside what its price gap is worth on both resale routes. Every number
// comes straight from the margin engine's output for captured store prices (Rule 3),
// and every price links to the store page it was read from.

import Link from "next/link";
import type { ArbitrageScenario, MarginInsight, OfferRef } from "@/server/margins/engine";
import type { ProductDto } from "@/server/products/service";
import { dossierHref, formatDateTime, formatPrice } from "../dashboard/format";
import { ArbitrageBadge } from "../dashboard/margin";
import { ProductCard } from "../dashboard/product-card";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const link = "font-medium text-accent-mint underline decoration-accent-mint/40 underline-offset-2 hover:decoration-accent-mint " + focusRing;
/** One bento tile: a midnight surface whose hairline ring lights up mint as it lifts. */
const tile =
  "rounded-2xl bg-surface-dark ring-1 ring-line-dark transition duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40 hover:ring-accent-mint/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

const money = (amount: number, currency: string) => formatPrice(String(amount), currency);

/**
 * A showcase product: only the two resale routes, priced from real captured store prices. v1's benchmark
 * wholesale estimate (and its caveats) is left out, so it never reaches the public page, not even in
 * the data sent to the browser.
 */
export type ShowcaseProduct = Omit<ProductDto, "margin"> & { margin: Pick<MarginInsight, "arbitrage" | "arbitrageOwnStore"> | null };

const ROUTE_NAME: Record<ArbitrageScenario["channel"], string> = { MARKETPLACE: "eBay", OWN_STORE: "Your own shop" };
const ROUTE_FEES: Record<ArbitrageScenario["channel"], string> = { MARKETPLACE: "eBay fees", OWN_STORE: "Card fees" };

/** A route with a complete trade to show (both stores, fees and a result). */
type Trade = ArbitrageScenario & { buy: OfferRef; sell: OfferRef; resalePrice: number; fees: number; netProfit: number; currency: string };
const isTrade = (s: ArbitrageScenario): s is Trade =>
  s.buy !== null && s.sell !== null && s.resalePrice !== null && s.fees !== null && s.netProfit !== null && s.currency !== null;

function Seen({ offer }: { offer: OfferRef }) {
  return (
    <span className="text-slate-400">
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
    <ul className="space-y-1.5 text-sm text-slate-300">
      <li>
        <span className="font-semibold text-white">Buy at {money(t.buy.price, t.currency)}</span> from{" "}
        <StoreLink offer={t.buy} /> <Seen offer={t.buy} />
      </li>
      <li>
        <span className="font-semibold text-white">Resell at {money(t.resalePrice, t.currency)}</span>, the
        going price at other stores, like <StoreLink offer={t.sell} /> <Seen offer={t.sell} />
      </li>
    </ul>
  );
}

/** The spread itself, big: the cheapest store's price against the going resale price elsewhere. */
function Spread({ trade: t }: { trade: Trade }) {
  const spread = Math.round((t.resalePrice - t.buy.price) * 100) / 100;
  const price = "text-xl font-bold tracking-tight tabular-nums text-white lg:text-3xl";
  const label = "text-xs font-medium text-slate-400";
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-white/[0.03] p-4 ring-1 ring-line-dark ring-inset sm:gap-4">
      <div>
        <dt className={label}>Buy</dt>
        <dd className={price}>{money(t.buy.price, t.currency)}</dd>
      </div>
      <div className="relative flex justify-center before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-gradient-to-r before:from-white/10 before:via-accent-mint before:to-white/10">
        <dt className="sr-only">Spread</dt>
        <dd className="relative rounded-full bg-accent-mint px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-background-dark tabular-nums shadow-md shadow-accent-mint/20 sm:px-3 sm:text-sm">
          {spread >= 0 ? "+" : "−"}
          {money(Math.abs(spread), t.currency)}
        </dd>
      </div>
      <div className="text-right">
        <dt className={label}>Resell</dt>
        <dd className={price}>{money(t.resalePrice, t.currency)}</dd>
      </div>
    </dl>
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
      <div role="img" aria-label={label} className="relative flex h-3 overflow-hidden rounded-full bg-white/10">
        <span className={`${grow} bg-slate-500`} style={{ width: pct(t.buy.price) }} />
        <span className={`${grow} bg-amber-500`} style={{ width: pct(t.fees) }} />
        <span className={`${grow} bg-emerald-400`} style={{ width: pct(Math.max(t.netProfit, 0)) }} />
        {loss && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5 bg-rose-400 transition-[left] duration-500 motion-reduce:transition-none"
            style={{ left: pct(t.resalePrice) }}
          />
        )}
      </div>
      <ul aria-hidden="true" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-slate-500" />
          Stock {money(t.buy.price, c)}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" />
          {ROUTE_FEES[t.channel]} {money(t.fees, c)}
        </li>
        {loss ? (
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-0.5 bg-rose-400" />
            Resale {money(t.resalePrice, c)}
          </li>
        ) : (
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400" />
            Yours {money(t.netProfit, c)}
          </li>
        )}
      </ul>
    </div>
  );
}

function RouteCard({ scenario: s, showTrade, className = "" }: { scenario: ArbitrageScenario; showTrade: boolean; className?: string }) {
  const t = isTrade(s) ? s : null;
  const loss = t !== null && t.netProfit < 0;
  return (
    <section aria-label={s.channelLabel} className={`${tile} flex flex-col gap-3 p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-white">{ROUTE_NAME[s.channel]}</h4>
        <ArbitrageBadge scenario={s} />
      </div>
      {t ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`text-3xl font-semibold tracking-tight tabular-nums ${
                loss ? "text-rose-300" : "text-emerald-300"
              }`}
            >
              {loss ? "−" : "+"}
              {money(Math.abs(t.netProfit), t.currency)}
            </span>
            <span className="text-sm text-slate-400">
              {loss ? "lost" : "kept"} per unit · {String(t.returnPct).replace("-", "−")}% return
            </span>
          </p>
          <SplitBar trade={t} />
          {showTrade && <PriceGap trade={t} />}
        </>
      ) : (
        <p className="text-sm text-slate-300">{s.summary}</p>
      )}
      <p className="mt-auto text-xs text-slate-400">
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
    <p className="text-xl font-semibold tracking-tight text-balance text-white sm:text-2xl">
      Same price gap, two results: {better} keeps{" "}
      <span className="font-semibold text-accent-mint tabular-nums">{money(Math.abs(diff), own.currency)}</span>{" "}
      more per unit.
    </p>
  );
}

const shortName = (p: ShowcaseProduct) => p.name.replace(/\s*\(.*?\)\s*/g, " ").trim();

/**
 * One product's tiles: the product card (tall), the price gap with the headline result,
 * and one tile per resale route. Every other product mirrors, card on the right, so
 * two products read as one bento grid rather than two identical rows.
 */
function ProductBento({ product: p, flip }: { product: ShowcaseProduct; flip: boolean }) {
  const m = p.margin;
  const shared = m !== null && sameTrade(m.arbitrage, m.arbitrageOwnStore);
  return (
    <article aria-label={shortName(p)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ul className={`sm:row-span-3 lg:row-span-2 ${flip ? "sm:col-start-2 sm:row-start-1 lg:col-start-3" : ""}`}>
        <ProductCard product={{ ...p, margin: null }} href={dossierHref(p)} frame="bento" marginSummary={false} />
      </ul>
      <div className={`${tile} flex flex-col gap-4 p-5 sm:p-6 lg:col-span-2 ${flip ? "sm:col-start-1 sm:row-start-1" : ""}`}>
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-accent-mint uppercase">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-mint" />
          Live price gap
        </p>
        {m ? (
          <>
            <Difference ebay={m.arbitrage} own={m.arbitrageOwnStore} />
            {shared && isTrade(m.arbitrage) && (
              <>
                <Spread trade={m.arbitrage} />
                <PriceGap trade={m.arbitrage} />
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-300">No current retail price was found for this product.</p>
        )}
        <Link
          href={dossierHref(p)}
          className={`group mt-auto inline-flex items-center justify-center gap-1.5 self-start rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-background-dark shadow-sm transition hover:bg-slate-200 active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
        >
          Open the full dossier
          <span className="sr-only">: {p.name}</span>
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
            →
          </span>
        </Link>
      </div>
      {m && (
        <>
          <RouteCard scenario={m.arbitrage} showTrade={!shared} className={flip ? "sm:col-start-1 sm:row-start-2" : ""} />
          <RouteCard
            scenario={m.arbitrageOwnStore}
            showTrade={!shared}
            className={flip ? "sm:col-start-1 sm:row-start-3 lg:col-start-2 lg:row-start-2" : ""}
          />
        </>
      )}
    </article>
  );
}

export function Showcase({ products }: { products: ShowcaseProduct[] }) {
  return (
    <div className="space-y-4">
      {products.map((p, i) => (
        <ProductBento key={p.id} product={p} flip={i % 2 === 1} />
      ))}
      <p className="pt-2 text-xs text-slate-400">
        Rule-based estimates from captured store prices, not guarantees. Shipping, VAT and returns aren&apos;t included,
        and a new shop usually needs advertising too.
      </p>
    </div>
  );
}
