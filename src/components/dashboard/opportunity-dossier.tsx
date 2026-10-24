"use client";

import { useId, useState } from "react";
import type { ProductDto } from "@/server/products/service";
import {
  estimateProfit,
  opportunityVerdict,
  parseMoney,
  shopifyPrices,
  sourcingKeywords,
  startingWholesale,
  supplierSearchUrls,
  type VerdictKind,
} from "./dossier";
import { PLANS, planPriceLabel } from "@/server/billing/plans";
import { formatPrice } from "./format";
import { MarginCard } from "./margin";
import { ProductDetail } from "./product-detail";

export type DossierViewer = { signedIn: boolean; proTools: boolean };

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const card = "rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-line-dark dark:bg-surface-dark";
const cardTitle = "text-sm font-semibold text-slate-900 dark:text-white";

export function OpportunityDossier({ product, viewer }: { product: ProductDto; viewer: DossierViewer }) {
  const [wholesale, setWholesale] = useState(startingWholesale(product.margin)?.toFixed(2) ?? "");
  const [adShipping, setAdShipping] = useState("");

  return (
    <div className="space-y-4">
      <VerdictCard product={product} />
      <MarginCard productId={product.id} margin={product.margin} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfitCalculator
          product={product}
          wholesale={wholesale}
          adShipping={adShipping}
          onWholesale={setWholesale}
          onAdShipping={setAdShipping}
        />
        <SupplierAndExport product={product} viewer={viewer} costPerItem={parseMoney(wholesale)} />
      </div>
      <details className="group rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line-dark dark:bg-surface-dark">
        <summary
          className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:bg-gray-50 sm:px-5 dark:text-slate-100 dark:hover:bg-surface-raised/50 [&::-webkit-details-marker]:hidden ${focusRing}`}
        >
          <span>
            Score breakdown &amp; evidence{" "}
            <span className="font-normal text-slate-400 dark:text-slate-400">
              ({product.evidenceCount} evidence item{product.evidenceCount === 1 ? "" : "s"} from {product.sourceCount} source{product.sourceCount === 1 ? "" : "s"})
            </span>
          </span>
          <Chevron className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-gray-200 p-4 sm:p-5 dark:border-line-dark">
          <ProductDetail product={product} />
        </div>
      </details>
    </div>
  );
}

// ── Verdict ──────────────────────────────────────────────────────────────────

const VERDICT_STYLE: Record<VerdictKind, { card: string; badge: string; icon: string }> = {
  HIGH_POTENTIAL: {
    card: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-950/20",
    badge: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950",
    icon: "M10 2.5 12.2 7l5 .7-3.6 3.5.9 5L10 13.8 5.5 16.2l.9-5L2.8 7.7l5-.7L10 2.5Z",
  },
  MODERATE_RISK: {
    card: "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-950/20",
    badge: "bg-amber-500 text-amber-950 dark:bg-amber-400",
    icon: "M10 3 18 17H2L10 3Zm0 5v4m0 2.5v.5",
  },
  CROWDED_MARKET: {
    card: "border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-950/20",
    badge: "bg-rose-600 text-white dark:bg-rose-500 dark:text-rose-950",
    icon: "M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 16c0-2.8 2.2-5 5-5s5 2.2 5 5m1-5c2.8 0 5 2.2 5 5",
  },
};

function VerdictCard({ product }: { product: ProductDto }) {
  const verdict = opportunityVerdict(product);
  if (!verdict) {
    return (
      <section className={card} aria-label="Opportunity verdict">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          There isn&apos;t enough evidence to give this product a verdict yet.
        </p>
      </section>
    );
  }
  const style = VERDICT_STYLE[verdict.kind];
  return (
    <section aria-labelledby={`verdict-${product.id}`} className={`rounded-xl border p-4 shadow-sm sm:p-5 ${style.card}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 id={`verdict-${product.id}`} className={cardTitle}>
          Opportunity verdict
        </h3>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${style.badge}`}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
            <path d={style.icon} />
          </svg>
          {verdict.label}
        </span>
      </div>
      <p className="mt-3 max-w-3xl text-base/7 text-slate-800 dark:text-slate-200">
        {verdict.sentences[0]} {verdict.sentences[1]}
      </p>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
        Rule-based estimate from {verdict.evidenceCount} evidence item{verdict.evidenceCount === 1 ? "" : "s"} ·{" "}
        {Math.round(verdict.confidence * 100)}% confidence · not a guarantee. See the evidence below.
      </p>
    </section>
  );
}

// ── Profit calculator ────────────────────────────────────────────────────────

function currencySymbol(currency: string) {
  return (
    new Intl.NumberFormat("en-GB", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

function ProfitCalculator({
  product,
  wholesale,
  adShipping,
  onWholesale,
  onAdShipping,
}: {
  product: ProductDto;
  wholesale: string;
  adShipping: string;
  onWholesale: (v: string) => void;
  onAdShipping: (v: string) => void;
}) {
  const offer = product.bestOffer;
  if (!offer) {
    return (
      <section aria-label="Profit calculator" className={card}>
        <h3 className={cardTitle}>Profit calculator</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          No current retail price was found for this product, so profit can&apos;t be estimated.
        </p>
      </section>
    );
  }
  const price = Number(offer.price.amount);
  const currency = offer.price.currency;
  const w = parseMoney(wholesale);
  const a = parseMoney(adShipping);
  const valid = w !== null && (adShipping.trim() === "" || a !== null);
  const result = valid ? estimateProfit(price, w, a ?? 0) : null;
  const loss = result !== null && result.net < 0;

  return (
    <section aria-labelledby={`profit-${product.id}`} className={card}>
      <h3 id={`profit-${product.id}`} className={cardTitle}>
        Profit calculator
      </h3>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-b border-gray-200 pb-3 dark:border-line-dark">
        <span className="text-sm text-slate-600 dark:text-slate-400">Retail price at {offer.merchant}</span>
        <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
          {formatPrice(offer.price.amount, currency)}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MoneyInput
          label="Wholesale cost"
          hint="Starts mid-way through the estimate above"
          currency={currency}
          value={wholesale}
          onChange={onWholesale}
          invalid={w === null}
        />
        <MoneyInput
          label="Ad & shipping per sale"
          hint="Your ad spend + delivery per order"
          currency={currency}
          value={adShipping}
          onChange={onAdShipping}
          placeholder="0.00"
          invalid={adShipping.trim() !== "" && a === null}
        />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3" aria-live="polite">
        <div className={`rounded-lg p-3 ${loss ? "bg-rose-50 dark:bg-rose-950/30" : "bg-emerald-50 dark:bg-emerald-950/30"}`}>
          <dt className="text-xs font-medium text-slate-700 dark:text-slate-300">Projected net profit</dt>
          <dd
            className={`mt-1 text-2xl font-semibold tabular-nums ${loss ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}
          >
            {result ? formatPrice(String(result.net), currency) : "—"}
          </dd>
          <dd className="text-xs text-slate-600 dark:text-slate-400">per sale</dd>
        </div>
        <div className="rounded-lg bg-gray-100 p-3 dark:bg-surface-raised/60">
          <dt className="text-xs font-medium text-slate-700 dark:text-slate-300">Profit margin</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {result?.marginPct != null ? `${result.marginPct.toFixed(1)}%` : "—"}
          </dd>
          <dd className="text-xs text-slate-600 dark:text-slate-400">of retail price</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        Estimate only, before VAT, payment fees and returns. Assumes you sell at the retail price shown.
      </p>
    </section>
  );
}

function MoneyInput({
  label,
  hint,
  currency,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  label: string;
  hint: string;
  currency: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid: boolean;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-900 dark:text-slate-100">
        {label}
      </label>
      <div
        className={`mt-1 flex items-center rounded-md bg-white ring-1 ring-inset focus-within:ring-2 focus-within:ring-accent-mint dark:bg-background-dark ${
          invalid ? "ring-rose-500" : "ring-gray-300 dark:ring-line-dark"
        }`}
      >
        <span aria-hidden="true" className="pl-3 text-sm text-slate-400 dark:text-slate-400">
          {currencySymbol(currency)}
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-hint`}
          className="w-full min-w-0 border-0 bg-transparent py-2 pr-3 pl-1.5 text-base tabular-nums text-slate-900 placeholder:text-slate-400 focus:outline-none sm:text-sm dark:text-white"
        />
      </div>
      <p id={`${id}-hint`} className={`mt-1 text-xs ${invalid ? "text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-400"}`}>
        {invalid ? "Enter an amount like 12.50" : hint}
      </p>
    </div>
  );
}

// ── Suppliers + Shopify export ───────────────────────────────────────────────

function SupplierAndExport({
  product,
  viewer,
  costPerItem,
}: {
  product: ProductDto;
  viewer: DossierViewer;
  costPerItem: number | null;
}) {
  const merchant = product.bestOffer?.merchant ?? null;
  const keywords = sourcingKeywords({ ...product, merchant });
  const urls = supplierSearchUrls(keywords);
  const [exported, setExported] = useState(false);
  const prices = shopifyPrices(product);
  const money = (x: number) => formatPrice(String(x), prices.currency ?? "GBP");
  // Built on the server, which checks for Pro; the cost is whatever the profit calculator holds.
  const csvHref = `/api/products/${encodeURIComponent(product.id)}/shopify-csv${costPerItem !== null && costPerItem > 0 ? `?cost=${costPerItem}` : ""}`;

  const supplierBtn = `inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm ${focusRing}`;

  return (
    <section aria-labelledby={`source-${product.id}`} className={`${card} flex flex-col gap-5`}>
      <div>
        <h3 id={`source-${product.id}`} className={cardTitle}>
          Find suppliers
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Searches for <q className="font-medium text-slate-900 dark:text-slate-100">{keywords}</q> without brand names.
        </p>
        {viewer.proTools ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <a href={urls.aliexpress} target="_blank" rel="noopener noreferrer" className={`${supplierBtn} bg-accent-mint text-on-accent hover:bg-accent-mint-strong`}>
              Find on AliExpress
              <ExternalIcon />
              <span className="sr-only">(opens in new tab)</span>
            </a>
            <a href={urls.alibaba} target="_blank" rel="noopener noreferrer" className={`${supplierBtn} bg-surface-dark text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200`}>
              Find on Alibaba
              <ExternalIcon />
              <span className="sr-only">(opens in new tab)</span>
            </a>
          </div>
        ) : null}
      </div>

      <div className="border-t border-gray-200 pt-4 dark:border-line-dark">
        <h3 className={cardTitle}>Sell it on Shopify</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          A ready-to-import file with the title, description, photo, prices and your wholesale cost. It imports as a
          draft, so nothing goes live until you publish it.
        </p>
        {prices.price !== null && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <dt className="font-medium text-slate-900 dark:text-slate-100">Price {money(prices.price)}</dt>
            <dd>{prices.priceIsGoingRate ? "the going price at other stores" : "the best price found"}</dd>
            <dt className="font-medium text-slate-900 dark:text-slate-100">
              Compare-at{prices.compareAtPrice !== null && ` ${money(prices.compareAtPrice)}`}
            </dt>
            <dd>
              {prices.compareAtPrice !== null && prices.rrp
                ? `the RRP on ${prices.rrp.merchant}`
                : prices.rrp
                  ? `left blank: the RRP (${money(Number(prices.rrp.amount))} on ${prices.rrp.merchant}) isn't above the price`
                  : "left blank: no RRP found"}
            </dd>
          </dl>
        )}
        {viewer.proTools ? (
          <>
            <a
              href={csvHref}
              download
              onClick={() => setExported(true)}
              className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:w-auto dark:bg-surface-raised dark:text-white dark:ring-line-dark dark:hover:bg-slate-700 ${focusRing}`}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                <path d="M10 3v10m0 0-4-4m4 4 4-4M3.5 15.5v1h13v-1" />
              </svg>
              Download Shopify CSV
            </a>
            <p role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              {exported ? "Downloaded. In Shopify go to Products › Import and choose this file." : ""}
            </p>
          </>
        ) : null}
      </div>

      {!viewer.proTools && (
        <div className="rounded-lg bg-accent-mint/10 p-4 ring-1 ring-accent-mint/30 ring-inset">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 text-accent-mint">
              <path fillRule="evenodd" d="M10 2a4 4 0 0 0-4 4v2H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4Zm2 6V6a2 2 0 1 0-4 0v2h4Z" clipRule="evenodd" />
            </svg>
            Supplier search and Shopify export are Pro features
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            Go from product idea to supplier to a draft listing in your shop in a couple of clicks.
          </p>
          <a
            href="/upgrade"
            className={`mt-3 inline-flex rounded-md bg-accent-mint px-4 py-2 text-sm font-semibold text-on-accent shadow-sm hover:bg-accent-mint-strong ${focusRing}`}
          >
            {viewer.signedIn ? `Upgrade to Pro · ${planPriceLabel(PLANS.pro)}` : `Sign in & upgrade · ${planPriceLabel(PLANS.pro)}`}
          </a>
        </div>
      )}
    </section>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M11 3h6v6m0-6-8 8M8 5H4v11h11v-4" />
    </svg>
  );
}

function Chevron({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
