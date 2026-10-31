"use client";

// The free EU duty calculator's form and result (/tools/eu-duty-calculator). Recalculates as the visitor
// types (engine/euDuty.ts, pure); nothing is sent anywhere. Every rate it uses is named under the result.

import { useId, useState } from "react";
import { EU_COUNTRY_NAMES, EU_DUTY_CATEGORIES, euDutyMargin } from "@/engine/euDuty";
import { EU_STANDARD_VAT } from "@/engine/policy";

const control =
  "mt-1 block w-full rounded-lg bg-white/[0.04] px-3 py-2.5 text-base text-white ring-1 ring-white/15 ring-inset placeholder:text-slate-500 focus:ring-2 focus:ring-accent-mint/70 focus:outline-none";
const gbp = (x: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(x);
const money = (s: string) => {
  const t = s.replace(/[£,\s]/g, "");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
};
const COUNTRIES = Object.keys(EU_STANDARD_VAT).sort((a, b) => EU_COUNTRY_NAMES[a].localeCompare(EU_COUNTRY_NAMES[b]));

function MoneyField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const invalid = Number.isNaN(money(value));
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
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint`}
        className={`${control} tabular-nums ${invalid ? "ring-rose-400" : ""}`}
      />
      <p id={`${id}-hint`} className={`mt-1 text-xs ${invalid ? "text-rose-300" : "text-slate-400"}`}>
        {invalid ? "Enter an amount like 12.50" : hint}
      </p>
    </div>
  );
}

export function EuDutyCalculator({ gbpPerEur, fxDate }: { gbpPerEur: number; fxDate: string }) {
  const ids = useId();
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [shipping, setShipping] = useState("");
  const [category, setCategory] = useState(EU_DUTY_CATEGORIES[0].id);
  const [country, setCountry] = useState("DE");
  const r = euDutyMargin({ salePrice: money(price), supplierCost: money(cost), shipping: money(shipping), category, country, gbpPerEur });
  const invalid = [cost, shipping].some((v) => Number.isNaN(money(v)));
  const result = r && !invalid ? r : null;
  const row = "flex items-baseline justify-between gap-4 py-2";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-5 rounded-2xl bg-surface-dark p-5 ring-1 ring-line-dark sm:p-6" onSubmit={(e) => e.preventDefault()} aria-label="Your sale">
        <MoneyField label="Item Sale Price (£)" hint="What the EU customer pays, EU VAT included" value={price} onChange={setPrice} />
        <MoneyField label="Supplier Cost (£)" hint="What one unit costs you" value={cost} onChange={setCost} />
        <MoneyField label="Shipping to EU (£)" hint="Your delivery cost per order" value={shipping} onChange={setShipping} />
        <div>
          <label htmlFor={`${ids}-cat`} className="block text-sm font-medium text-white">
            Tariff Category
          </label>
          <select id={`${ids}-cat`} value={category} onChange={(e) => setCategory(e.target.value)} className={`${control} appearance-auto`}>
            {EU_DUTY_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id} className="bg-surface-dark">
                {c.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Up to €150 every category pays the same €3; over €150 the duty depends on it.</p>
        </div>
        <div>
          <label htmlFor={`${ids}-country`} className="block text-sm font-medium text-white">
            Selling to
          </label>
          <select id={`${ids}-country`} value={country} onChange={(e) => setCountry(e.target.value)} className={`${control} appearance-auto`}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c} className="bg-surface-dark">
                {EU_COUNTRY_NAMES[c]} (VAT {Math.round(EU_STANDARD_VAT[c] * 100)}%)
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">For the destination country&apos;s VAT, which you charge at checkout (IOSS).</p>
        </div>
      </form>

      <section aria-labelledby={`${ids}-result`} aria-live="polite" className="rounded-2xl bg-surface-dark p-5 ring-1 ring-line-dark sm:p-6">
        <h2 id={`${ids}-result`} className="font-mono text-[11px] tracking-widest text-slate-400 uppercase">
          Your margin per sale
        </h2>
        {result ? (
          <>
            <p className={`mt-2 text-4xl font-bold tracking-tight tabular-nums ${result.profit >= 0 ? "text-white" : "text-rose-300"}`}>
              {result.profit < 0 && "−"}
              {gbp(Math.abs(result.profit))}
            </p>
            <p className="text-sm text-slate-300">
              {result.marginPct}% of the sale price, after the new EU charges
            </p>
            <p className="mt-4 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-400/30 ring-inset">
              The new EU charges cost you <span className="font-semibold text-white">{gbp(result.newCharges)}</span> on this sale: you&apos;d keep{" "}
              {gbp(result.profitBefore)} without them.
            </p>
            <dl className="mt-4 divide-y divide-white/[0.06] text-sm text-slate-300">
              <div className={row}>
                <dt>Sale price</dt>
                <dd className="shrink-0 whitespace-nowrap font-semibold text-white tabular-nums">{gbp(money(price))}</dd>
              </div>
              <div className={row}>
                <dt>
                  {EU_COUNTRY_NAMES[country]} VAT ({Math.round(result.vatRate * 100)}%)
                </dt>
                <dd className="shrink-0 whitespace-nowrap tabular-nums">−{gbp(result.vat)}</dd>
              </div>
              <div className={row}>
                <dt>Supplier cost</dt>
                <dd className="shrink-0 whitespace-nowrap tabular-nums">−{gbp(money(cost))}</dd>
              </div>
              <div className={row}>
                <dt>Shipping to EU</dt>
                <dd className="shrink-0 whitespace-nowrap tabular-nums">−{gbp(money(shipping))}</dd>
              </div>
              <div className={row}>
                <dt className="min-w-0">{result.duty.note}</dt>
                <dd className="shrink-0 whitespace-nowrap tabular-nums">{result.duty.kind === "not_counted" ? "—" : `−${gbp(result.duty.amount)}`}</dd>
              </div>
              <div className={row}>
                <dt className="min-w-0">€2 Union handling fee (from 1 November 2026)</dt>
                <dd className="shrink-0 whitespace-nowrap tabular-nums">−{gbp(result.handling)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              The item is worth €{result.valueEur.toFixed(2)} before VAT. Euro charges converted at the ECB reference rate of {fxDate} (€1 = £
              {gbpPerEur.toFixed(4)}). Marketplace and payment fees aren&apos;t included. A calculated estimate, not tax advice.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-400">
            {invalid ? "Check the amounts: each one needs to be a number like 4.50." : "Enter your sale price to see what you keep after the €3 duty and the €2 handling fee."}
          </p>
        )}
      </section>
    </div>
  );
}
