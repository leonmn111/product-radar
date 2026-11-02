"use client";

// The free TikTok Shop UK calculator's form and result (/tools/tiktok-shop-uk-calculator). Recalculates as
// the visitor types (engine/tiktokShopUk.ts, pure); nothing is sent anywhere. Every rate it uses is named
// under the result.

import { useId, useState } from "react";
import { TIKTOK_SHOP_UK_CATEGORIES, TIKTOK_SHOP_UK_DEFAULT_CREATOR_PCT, TIKTOK_SHOP_UK_ORDER_FEE, tiktokShopUkMargin } from "@/engine/tiktokShopUk";

const control =
  "mt-1 block w-full rounded-lg bg-white/[0.04] px-3 py-2.5 text-base text-white ring-1 ring-white/15 ring-inset placeholder:text-slate-500 focus:ring-2 focus:ring-accent-mint/70 focus:outline-none";
const gbp = (x: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(x);
const number = (s: string, strip: RegExp) => {
  const t = s.replace(strip, "");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
};
const money = (s: string) => number(s, /[£,\s]/g);
const percent = (s: string) => {
  const n = number(s, /[%\s]/g);
  return n <= 100 ? n : Number.NaN;
};
const pctLabel = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

function NumberField({
  label,
  hint,
  error,
  value,
  onChange,
  parse,
  placeholder,
}: {
  label: string;
  hint: string;
  error: string;
  value: string;
  onChange: (v: string) => void;
  parse: (s: string) => number;
  placeholder: string;
}) {
  const id = useId();
  const invalid = Number.isNaN(parse(value));
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-white">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint`}
        className={`${control} tabular-nums ${invalid ? "ring-rose-400" : ""}`}
      />
      <p id={`${id}-hint`} className={`mt-1 text-xs ${invalid ? "text-rose-300" : "text-slate-400"}`}>
        {invalid ? error : hint}
      </p>
    </div>
  );
}

export function TikTokShopUkCalculator() {
  const ids = useId();
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [category, setCategory] = useState(TIKTOK_SHOP_UK_CATEGORIES[0].id);
  const [creator, setCreator] = useState(String(TIKTOK_SHOP_UK_DEFAULT_CREATOR_PCT));
  const [vatRegistered, setVatRegistered] = useState(false);
  const r = tiktokShopUkMargin({ salePrice: money(price), landedCost: money(cost), category, creatorPct: percent(creator), vatRegistered });
  const invalid = Number.isNaN(money(cost)) || Number.isNaN(percent(creator));
  const result = r && !invalid ? r : null;
  const row = "flex items-baseline justify-between gap-4 py-2";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-5 rounded-2xl bg-surface-dark p-5 ring-1 ring-line-dark sm:p-6" onSubmit={(e) => e.preventDefault()} aria-label="Your sale">
        <NumberField
          label="Item Sale Price (£)"
          hint="What the customer pays on TikTok Shop"
          error="Enter an amount like 19.99"
          placeholder="0.00"
          value={price}
          onChange={setPrice}
          parse={money}
        />
        <NumberField
          label="Supplier Landed Cost (£)"
          hint="Cost of goods + shipping to the UK, per unit"
          error="Enter an amount like 6.50"
          placeholder="0.00"
          value={cost}
          onChange={setCost}
          parse={money}
        />
        <div>
          <label htmlFor={`${ids}-cat`} className="block text-sm font-medium text-white">
            Product Category
          </label>
          <select id={`${ids}-cat`} value={category} onChange={(e) => setCategory(e.target.value)} className={`${control} appearance-auto`}>
            {TIKTOK_SHOP_UK_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id} className="bg-surface-dark">
                {c.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">TikTok&apos;s referral commission on each sale.</p>
        </div>
        <NumberField
          label="Creator Commission (%)"
          hint="What you pay the affiliate creator who makes the sale. 0 if you sell it yourself."
          error="Enter a percentage from 0 to 100"
          placeholder="15"
          value={creator}
          onChange={setCreator}
          parse={percent}
        />
        <div className="flex items-start gap-3">
          <input
            id={`${ids}-vat`}
            type="checkbox"
            checked={vatRegistered}
            onChange={(e) => setVatRegistered(e.target.checked)}
            aria-describedby={`${ids}-vat-hint`}
            className="mt-0.5 size-5 shrink-0 rounded accent-accent-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint"
          />
          <div>
            <label htmlFor={`${ids}-vat`} className="block text-sm font-medium text-white">
              I&apos;m VAT-registered
            </label>
            <p id={`${ids}-vat-hint`} className="mt-0.5 text-xs text-slate-400">
              Then 20% VAT is inside your sale price and goes to HMRC.
            </p>
          </div>
        </div>
      </form>

      <section aria-labelledby={`${ids}-result`} aria-live="polite" className="rounded-2xl bg-surface-dark p-5 ring-1 ring-line-dark sm:p-6">
        <h2 id={`${ids}-result`} className="font-mono text-[11px] tracking-widest text-slate-400 uppercase">
          Net profit per sale, before ads
        </h2>
        {result ? (
          <>
            <p className={`mt-2 text-4xl font-bold tracking-tight tabular-nums ${result.netProfit >= 0 ? "text-white" : "text-rose-300"}`}>
              {result.netProfit < 0 && "−"}
              {gbp(Math.abs(result.netProfit))}
            </p>
            <p className="text-sm text-slate-300">
              {result.marginPct < 0 ? `−${Math.abs(result.marginPct)}` : result.marginPct}% of the sale price, after TikTok&apos;s fees and the creator&apos;s cut
            </p>

            {result.maxAdCost > 0 ? (
              <div className="mt-4 rounded-xl bg-accent-mint/10 px-4 py-3 ring-1 ring-accent-mint/30 ring-inset">
                <p className="text-sm text-slate-200">
                  Max ad cost per sale: <span className="text-2xl font-bold text-white tabular-nums">{gbp(result.maxAdCost)}</span>
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Spend up to this on ads to win each sale and you break even. Your ads need to bring in at least{" "}
                  <span className="font-semibold text-white">{gbp(result.breakEvenRoas!)}</span> of sales for every £1 they cost (break-even ROAS{" "}
                  {result.breakEvenRoas!.toFixed(2)}).
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-rose-400/10 px-4 py-3 ring-1 ring-rose-400/30 ring-inset">
                <p className="text-sm text-slate-200">
                  Max ad cost per sale: <span className="text-2xl font-bold text-white tabular-nums">{gbp(0)}</span>
                </p>
                <p className="mt-1 text-sm text-rose-100">
                  {result.netProfit < 0 ? `Loses ${gbp(-result.netProfit)} per sale before ads` : "Breaks even before ads"}: there&apos;s nothing left to spend on
                  ads. Raise the price or find a cheaper supplier.
                </p>
              </div>
            )}

            <dl className="mt-4 divide-y divide-white/[0.06] text-sm text-slate-300">
              <div className={row}>
                <dt>Sale price</dt>
                <dd className="shrink-0 whitespace-nowrap font-semibold text-white tabular-nums">{gbp(money(price))}</dd>
              </div>
              {vatRegistered && (
                <div className={row}>
                  <dt>VAT (20%, paid to HMRC)</dt>
                  <dd className="shrink-0 whitespace-nowrap tabular-nums">−{gbp(result.vat)}</dd>
                </div>
              )}
              <div className={row}>
                <dt>Supplier landed cost</dt>
                <dd className="shrink-0 whitespace-nowrap tabular-nums">−{gbp(money(cost))}</dd>
              </div>
              <div className={row}>
                <dt className="min-w-0">
                  TikTok platform fee ({pctLabel(result.referralRate)} + {gbp(TIKTOK_SHOP_UK_ORDER_FEE)} self-ship fee)
                </dt>
                <dd className="shrink-0 whitespace-nowrap tabular-nums">−{gbp(result.platformFee)}</dd>
              </div>
              <div className={row}>
                <dt>Creator commission ({percent(creator)}%)</dt>
                <dd className="shrink-0 whitespace-nowrap tabular-nums">−{gbp(result.creatorCut)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              {vatRegistered
                ? "TikTok's commission and the creator's are worked out on the price before VAT. "
                : "Not VAT-registered, so there's no VAT to take off. "}
              Returns, refunds and ads aren&apos;t included. Rates change: check yours in TikTok Seller Center. A calculated estimate, not financial advice.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-400">
            {invalid
              ? "Check the amounts: prices need to be a number like 4.50, and the commission a percentage from 0 to 100."
              : "Enter your sale price to see what you keep after TikTok's fees, and the most you can spend on ads per sale."}
          </p>
        )}
      </section>
    </div>
  );
}
