"use client";

import { useId, useState } from "react";
import type { ProductDto } from "@/server/products/service";
import { FINANCIAL_THRESHOLD } from "@/engine/confidence";
import { money2, ukSellingCosts } from "@/engine/sellingCosts";
import type { CatalogMargin } from "@/services/catalogMargin";
import type { VerdictTier } from "@/engine/verdict";
import { VerdictPill } from "../verdict-pill";
import { opportunityVerdict, parseMoney, shopifyPrices, sourcingKeywords, supplierSearchUrls } from "./dossier";
import { PLANS, planPriceLabel } from "@/server/billing/plans";
import { formatPrice } from "./format";
import { LandedMarginCard } from "./landed-margin";
import { MarginCard } from "./margin";
import { ProductDetail } from "./product-detail";
import {
  CALCULATOR_WARNING,
  complianceNote,
  EXPORT_CONFIRM,
  IP_RISK_NOTE,
  NO_SUPPLIERS_NOTE,
  RESELLABILITY_ORDER,
  resaleRisk,
  SUPPLIER_WARNING_COMPLIANCE,
  type ResaleRisk,
} from "./resellability";

export type DossierViewer = { signedIn: boolean; proTools: boolean };

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const card = "rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-line-dark dark:bg-surface-dark";
const cardTitle = "text-sm font-semibold text-slate-900 dark:text-white";

/**
 * The v1 dossier. The verdict is the four-tier scale with its hard gates (engine/verdict.ts). A product that
 * fails a resale check (product.resellable) gets no price gaps. A brand-restricted one (High IP Risk, gate
 * G3) is "Avoid (brand-restricted)": no landed margin and no supplier links anywhere, but the calculator
 * (for the brand's wholesale price) and the Shopify export stay open under warnings, and the export asks
 * for confirmation. A Compliance Gated one keeps its margin and supplier search under warnings.
 * The calculator starts from the sourced waterfall when it's shown; otherwise from the UK store price
 * when that clears the 0.7 gate, and the seller adds their own cost.
 */
export function OpportunityDossier({ product, landed, viewer }: { product: ProductDto; landed: CatalogMargin; viewer: DossierViewer }) {
  const shown = landed.margin.status === "shown" ? landed.margin.value : null;
  const sourcedCost = shown?.lines.find((l) => l.kind === "supplier")?.amount.amount;
  const [supplierCost, setSupplierCost] = useState(sourcedCost?.toFixed(2) ?? "");
  const risk = product.resellable ? null : (resaleRisk(landed.resellability) ?? "ip");
  const { price, confidence, stores } = landed.retail;
  const storesWord = `${stores} current UK store price${stores === 1 ? "" : "s"}`;
  const calculator = shown
    ? { initialPrice: shown.retailPrice.amount, priceHint: `The waterfall's price: median of ${storesWord}` }
    : price !== null && confidence >= FINANCIAL_THRESHOLD
      ? { initialPrice: price, priceHint: `Median of ${storesWord}` }
      : {
          initialPrice: null,
          priceHint:
            price === null
              ? "No current UK store price found: enter yours"
              : `UK prices too thin to fill in (confidence ${confidence.toFixed(2)}, needs ${FINANCIAL_THRESHOLD.toFixed(2)}): enter yours`,
        };

  return (
    <div className="space-y-4">
      <VerdictCard product={product} landed={landed} />
      <LandedMarginCard productId={product.id} landed={landed} />
      {product.resellable && <MarginCard productId={product.id} margin={product.margin} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfitCalculator
          productId={product.id}
          {...calculator}
          cost={supplierCost}
          onCost={setSupplierCost}
          costLabel={risk === "ip" ? "Wholesale cost per unit" : "Supplier cost per unit"}
          costHint={
            shown
              ? "Starts at the sourced AliExpress price"
              : risk === "ip"
                ? "The brand's wholesale price, if you're an authorised reseller"
                : risk === "compliance"
                  ? "From a supplier with the right UK safety paperwork"
                  : "Enter a supplier's quote"
          }
          warning={risk ? CALCULATOR_WARNING[risk] : null}
        />
        <SupplierAndExport product={product} viewer={viewer} risk={risk} costPerItem={parseMoney(supplierCost)} />
      </div>
      <details className="group rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line-dark dark:bg-surface-dark">
        <summary
          className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:bg-gray-50 sm:px-5 dark:text-slate-100 dark:hover:bg-surface-raised/50 [&::-webkit-details-marker]:hidden ${focusRing}`}
        >
          <span>
            Score breakdown &amp; evidence{" "}
            <span className="font-normal text-slate-400 dark:text-slate-400">
              ({product.sourceCount} source{product.sourceCount === 1 ? "" : "s"})
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

const VERDICT_CARD: Record<VerdictTier, string> = {
  LAUNCH: "border-teal-200 bg-teal-50/60 dark:border-teal-500/30 dark:bg-teal-950/20",
  TEST: "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-950/20",
  AVOID: "border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-950/20",
  WITHHELD: "border-slate-200 bg-slate-50 dark:border-line-dark dark:bg-surface-dark",
};

/**
 * The verdict, on the four-tier scale: Launch, Test small, Avoid ("Avoid (brand-restricted)" for a brand,
 * gate G3; "Loses £X per sale before ads", gate G1) or Not enough evidence. A product that fails a resale
 * check also shows what that means for a seller.
 */
function VerdictCard({ product, landed }: { product: ProductDto; landed: CatalogMargin }) {
  const verdict = opportunityVerdict(product, landed);
  const flags = landed.resellability;
  const risk = product.resellable ? null : (resaleRisk(flags) ?? "ip");
  const flagged = RESELLABILITY_ORDER.filter((k) => flags[k].value === true).map((k) => flags[k].reason);
  const confidence = `${Math.round(verdict.confidence * 100)}% confidence`;
  return (
    <section aria-labelledby={`verdict-${product.id}`} className={`rounded-xl border p-4 shadow-sm sm:p-5 ${VERDICT_CARD[verdict.kind]}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 id={`verdict-${product.id}`} className={cardTitle}>
          Opportunity verdict
        </h3>
        <VerdictPill tier={verdict.kind} gate={verdict.gate} />
      </div>
      {risk && <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{risk === "ip" ? IP_RISK_NOTE : complianceNote(flags)}</p>}
      <p className="mt-3 max-w-3xl text-base/7 text-slate-800 dark:text-slate-200">
        {verdict.sentences[0]} {verdict.sentences[1]}
        {risk && flagged.length > 0 && ` Flagged because ${flagged.length === 1 ? flagged[0] : `${flagged.slice(0, -1).join(", ")} and ${flagged.at(-1)}`}.`}
      </p>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
        {verdict.gate === "G3_BRAND"
          ? "Rule-based, from the product's own listing text. See the resale checks below."
          : verdict.gate === "G1_PROFIT"
            ? "Rule-based, from the landed margin below. A calculated estimate, not a guarantee."
            : verdict.kind === "WITHHELD"
              ? "Rule-based. A verdict is given from 50% confidence; see the evidence below."
              : `Rule-based estimate from ${verdict.sourceCount} source${verdict.sourceCount === 1 ? "" : "s"} · ${confidence} · not a guarantee. See the evidence below.`}
      </p>
    </section>
  );
}

// ── Warnings ─────────────────────────────────────────────────────────────────

/** A risk warning at the top of a premium section: impossible to miss, and read out first. */
function RiskWarning({ text }: { text: string }) {
  return <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-900 ring-1 ring-rose-300 ring-inset dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-400/40">{text}</p>;
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
  productId,
  initialPrice,
  priceHint,
  cost,
  onCost,
  costLabel,
  costHint,
  warning,
}: {
  productId: string;
  /** The selling price to start from (VAT included), or null when there's no sourced one to show. */
  initialPrice: number | null;
  priceHint: string;
  cost: string;
  onCost: (v: string) => void;
  costLabel: string;
  costHint: string;
  warning: string | null;
}) {
  const [price, setPrice] = useState(initialPrice?.toFixed(2) ?? "");
  const [adShipping, setAdShipping] = useState("");
  const currency = "GBP";
  const p = parseMoney(price);
  const c = parseMoney(cost);
  const a = parseMoney(adShipping);
  // VAT and fees from the price alone: the same arithmetic as the landed margin (engine/sellingCosts.ts).
  const costs = p !== null && p > 0 ? ukSellingCosts(p) : null;
  const net = costs && c !== null && (adShipping.trim() === "" || a !== null) ? money2(p! - costs.total - c - (a ?? 0)) : null;
  const marginPct = net !== null ? Math.round((net / p!) * 1000) / 10 : null;
  const loss = net !== null && net < 0;
  const money = (x: number) => formatPrice(String(x), currency);
  const bad = (raw: string, parsed: number | null) => raw.trim() !== "" && parsed === null;

  return (
    <section aria-labelledby={`profit-${productId}`} className={`${card} flex flex-col gap-3`}>
      <h3 id={`profit-${productId}`} className={cardTitle}>
        Profit calculator
      </h3>
      {warning && <RiskWarning text={warning} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <MoneyInput label="Selling price (VAT included)" hint={priceHint} currency={currency} value={price} onChange={setPrice} placeholder="0.00" invalid={bad(price, p)} />
        </div>
        <MoneyInput label={costLabel} hint={costHint} currency={currency} value={cost} onChange={onCost} placeholder="0.00" invalid={bad(cost, c)} />
        <MoneyInput
          label="Ad & shipping per sale"
          hint="Your ad spend + delivery per order"
          currency={currency}
          value={adShipping}
          onChange={setAdShipping}
          placeholder="0.00"
          invalid={bad(adShipping, a)}
        />
      </div>
      <dl className="divide-y divide-gray-200 border-y border-gray-200 text-sm dark:divide-line-dark dark:border-line-dark">
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-slate-600 dark:text-slate-400">VAT (20%) and TikTok Shop UK fees</dt>
          <dd className="font-semibold tabular-nums text-slate-900 dark:text-white">{costs ? `−${money(costs.total)}` : "—"}</dd>
        </div>
      </dl>
      <dl className="grid grid-cols-2 gap-3" aria-live="polite">
        <div className={`rounded-lg p-3 ${net === null ? "bg-gray-100 dark:bg-surface-raised/60" : loss ? "bg-rose-50 dark:bg-rose-950/30" : "bg-emerald-50 dark:bg-emerald-950/30"}`}>
          <dt className="text-xs font-medium text-slate-700 dark:text-slate-300">Net profit</dt>
          <dd
            className={`mt-1 text-2xl font-semibold tabular-nums ${net === null ? "text-slate-900 dark:text-white" : loss ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}
          >
            {net !== null ? money(net) : "—"}
          </dd>
          <dd className="text-xs text-slate-600 dark:text-slate-400">per sale</dd>
        </div>
        <div className="rounded-lg bg-gray-100 p-3 dark:bg-surface-raised/60">
          <dt className="text-xs font-medium text-slate-700 dark:text-slate-300">Net margin</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{marginPct !== null ? `${marginPct.toFixed(1)}%` : "—"}</dd>
          <dd className="text-xs text-slate-600 dark:text-slate-400">of the selling price</dd>
        </div>
      </dl>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Same VAT and fee rules as the landed margin: 9% referral, £0.50 per order and a 15% creator commission (an
        estimate). Returns aren&apos;t included
        {costs?.collectedAt === "import" ? ", and over £135 before VAT customs duty is due at import and isn't counted" : ""}.
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
  risk,
  costPerItem,
}: {
  product: ProductDto;
  viewer: DossierViewer;
  /** A failed resale check: both sections stay open under its warning, and the export asks first. */
  risk: ResaleRisk;
  costPerItem: number | null;
}) {
  const merchant = product.bestOffer?.merchant ?? null;
  const keywords = sourcingKeywords({ ...product, merchant });
  const urls = supplierSearchUrls(keywords);
  // Gate G3: a brand-restricted product gets no supplier links at all.
  const restricted = risk === "ip";
  const [exported, setExported] = useState(false);
  const prices = shopifyPrices(product);
  const money = (x: number) => formatPrice(String(x), prices.currency ?? "GBP");
  // Built on the server, which checks for Pro and, for a risky product, that the warning was confirmed.
  // The cost is whatever the calculator holds.
  const query = new URLSearchParams({
    ...(costPerItem !== null && costPerItem > 0 ? { cost: String(costPerItem) } : {}),
    ...(risk ? { acknowledgeRisk: risk } : {}),
  }).toString();
  const csvHref = `/api/products/${encodeURIComponent(product.id)}/shopify-csv${query ? `?${query}` : ""}`;

  const supplierBtn = `inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm ${focusRing}`;

  return (
    <section aria-labelledby={`source-${product.id}`} className={`${card} flex flex-col gap-5`}>
      <div>
        <h3 id={`source-${product.id}`} className={cardTitle}>
          {restricted ? "Suppliers" : "Find suppliers"}
        </h3>
        {restricted ? (
          <div className="mt-2">
            <RiskWarning text={NO_SUPPLIERS_NOTE} />
          </div>
        ) : (
          <>
            {risk === "compliance" && (
              <div className="mt-2">
                <RiskWarning text={SUPPLIER_WARNING_COMPLIANCE} />
              </div>
            )}
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Searches for <q className="font-medium text-slate-900 dark:text-slate-100">{keywords}</q> without brand names.
            </p>
          </>
        )}
        {viewer.proTools && !restricted ? (
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
          A ready-to-import draft with the title, prices and your cost. The description is a placeholder for you to write
          and the photo is left blank, so nothing copies the brand&apos;s text or images. Nothing goes live until you publish it.
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
              onClick={(e) => {
                // A risky product's file downloads only once the seller confirms the warning.
                if (risk && !window.confirm(EXPORT_CONFIRM[risk])) {
                  e.preventDefault();
                  return;
                }
                setExported(true);
              }}
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
            {restricted ? "Shopify export is a Pro feature" : "Supplier search and Shopify export are Pro features"}
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {restricted
              ? "Turn a product into a draft listing in your shop in a couple of clicks."
              : "Go from product idea to supplier to a draft listing in your shop in a couple of clicks."}
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
