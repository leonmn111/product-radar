// The UK landed margin waterfall on the dossier page (src/services/catalogMargin.ts): retail price,
// then every cost line with how it's known, down to the net profit, and the resale checks that run
// first. A withheld margin shows why and what evidence it still needs, never a number (CLAUDE.md Rule 5).

import type { ReactNode } from "react";
import { FINANCIAL_THRESHOLD } from "@/engine/confidence";
import type { CatalogMargin } from "@/services/catalogMargin";
import type { ComplianceFlag } from "@/types/dossier";
import type { LandedMargin, LineBasis, Money } from "@/types/financials";
import { formatDateTime, formatPrice } from "./format";
import { RESELLABILITY_LABEL, RESELLABILITY_ORDER, resaleRisk, RISK_BADGE } from "./resellability";

const card = "rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-line-dark dark:bg-surface-dark";
const muted = "text-slate-600 dark:text-slate-400";
const link =
  "font-medium text-accent-mint underline decoration-accent-mint/40 underline-offset-2 hover:decoration-accent-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";

const money = (m: Money) => formatPrice(String(m.amount), m.currency);
const pct = (n: number) => `${n.toFixed(1)}%`;
const conf = (c: number) => c.toFixed(2);

const CHIP = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  warn: "bg-amber-50 text-amber-800 ring-amber-600/20",
  bad: "bg-rose-50 text-rose-800 ring-rose-600/20",
  off: "bg-gray-100 text-slate-700 ring-slate-500/20",
} as const;

function Chip({ tone, children }: { tone: keyof typeof CHIP; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${CHIP[tone]}`}>{children}</span>;
}

const BASIS: Record<LineBasis, { label: string; tone: keyof typeof CHIP }> = {
  sourced: { label: "Sourced", tone: "off" },
  caller_supplied: { label: "Yours", tone: "off" },
  estimate: { label: "Estimate", tone: "warn" },
};

const CHANNEL: Record<LandedMargin["channel"], string> = {
  tiktok_shop_uk: "TikTok Shop UK",
  amazon_uk_fba: "Amazon UK (FBA)",
  amazon_eu_fba: "Amazon EU (FBA)",
  custom: "your channel",
};

/** Bars standing in for withheld figures: no digits, hidden from screen readers. */
function Blurred() {
  return (
    <div aria-hidden="true" className="pointer-events-none mt-3 space-y-2.5 blur-[3px] select-none">
      {["w-28", "w-40", "w-36", "w-44", "w-32", "w-24"].map((w, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className={`h-2.5 ${w} rounded-sm bg-slate-200`} />
          <div className="h-2.5 w-14 rounded-sm bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function Waterfall({ m, landed }: { m: LandedMargin; landed: CatalogMargin }) {
  const stores = landed.retailOffers.length;
  const suppliers = landed.supplierMatches.length;
  const row = "flex items-baseline justify-between gap-4 py-2";
  const value = "shrink-0 text-right font-medium tabular-nums text-slate-900 dark:text-white";
  const loss = m.netProfit.amount < 0;
  return (
    <div className="mt-3">
      <dl className="divide-y divide-gray-200 text-sm dark:divide-line-dark">
        <div className={row}>
          <dt className="min-w-0">
            <span className="font-semibold text-slate-900 dark:text-white">Retail price</span>
            <span className={`block text-xs ${muted}`}>
              median of {stores} current UK store price{stores === 1 ? "" : "s"}, VAT included
            </span>
          </dt>
          <dd className={`${value} font-semibold`}>{money(m.retailPrice)}</dd>
        </div>
        {m.lines.map((l) => (
          <div key={`${l.kind}-${l.label}`} className={row}>
            <dt className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-slate-800 dark:text-slate-200">
              <span>
                {l.kind === "supplier" ? `Supplier unit cost (median of ${suppliers} matched AliExpress listing${suppliers === 1 ? "" : "s"})` : l.label}
              </span>
              <Chip tone={BASIS[l.basis].tone}>{BASIS[l.basis].label}</Chip>
            </dt>
            <dd className={value}>−{money(l.amount)}</dd>
          </div>
        ))}
        <div className={`${row} border-t-2 border-t-slate-900 dark:border-t-slate-100`}>
          <dt className="font-semibold text-slate-900 dark:text-white">Net profit per unit</dt>
          <dd className={`shrink-0 text-right text-lg font-semibold tabular-nums ${loss ? "text-rose-700" : "text-emerald-700"}`}>{money(m.netProfit)}</dd>
        </div>
      </dl>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Net margin", pct(m.netMarginPct), "of the retail price"],
          ["Return on cost", pct(m.roiPercentage), "net ÷ landed cost"],
          ["Landed cost", money(m.landedCost), "per unit"],
          ["Break-even ad spend", money(m.breakEvenAdCost), "most a sale can spend"],
        ].map(([label, v, note]) => (
          <div key={label} className="rounded-lg border border-gray-200 p-3 dark:border-line-dark">
            <dt className={`text-xs font-medium ${muted}`}>{label}</dt>
            <dd className="mt-1 text-base font-semibold tabular-nums text-slate-900 dark:text-white">{v}</dd>
            <dd className={`text-xs ${muted}`}>{note}</dd>
          </div>
        ))}
      </dl>
      {m.excluded.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">Not counted, because it couldn&apos;t be sourced:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {m.excluded.map((x) => (
              <li key={x.label}>
                {x.label}: {x.reason.replace("breakEvenAdCost shows", "the break-even ad spend above shows")}.
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className={`mt-3 text-xs ${muted}`}>
        Selling on Amazon UK instead? Its referral and FBA fees depend on the product&apos;s category and size tier, which
        this product&apos;s data doesn&apos;t include, so no Amazon figure is shown.
      </p>
      {suppliers > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Matched suppliers</h4>
          <ul className="mt-1 divide-y divide-gray-200 text-xs dark:divide-line-dark">
            {landed.supplierMatches.map((s) => (
              <li key={s.evidenceId} className="flex items-baseline justify-between gap-3 py-1.5">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className={`${link} relative min-w-0 truncate`}>
                  {s.title}
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
                <span className="shrink-0 tabular-nums text-slate-900 dark:text-white">
                  {formatPrice(String(s.unitPrice), "GBP")} <span className={muted}>· {Math.round(s.matchScore * 100)}% match</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CheckRow({ label, flag }: { label: string; flag: ComplianceFlag }) {
  const [tone, word] = flag.value === true ? (["bad", "Fails"] as const) : flag.value === false ? (["ok", "Clear"] as const) : (["off", "Unknown"] as const);
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        <p className={`text-xs ${muted}`}>{flag.reason}</p>
      </div>
      <Chip tone={tone}>{word}</Chip>
    </li>
  );
}

function Sources({ landed }: { landed: CatalogMargin }) {
  if (landed.evidence.length === 0) return null;
  return (
    <details className="group mt-4 border-t border-gray-200 pt-3 dark:border-line-dark">
      <summary className="cursor-pointer list-none text-xs font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint dark:text-white [&::-webkit-details-marker]:hidden">
        Sources ({landed.evidence.length}) <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">›</span>
      </summary>
      <ul className="mt-2 space-y-2 text-xs">
        {landed.evidence.map((e) => (
          <li key={e.id} className="min-w-0">
            <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className={link}>
              {e.provider}
              <span className="sr-only"> (opens in new tab)</span>
            </a>
            <span className={`tabular-nums ${muted}`}>
              {" "}
              · seen {formatDateTime(e.observedAt)} · quality {Math.round(e.quality)}/100
            </span>
            <p className="text-slate-700 dark:text-slate-300">{e.claim}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The landed margin card: the waterfall when it clears its gate, otherwise why it's withheld. */
export function LandedMarginCard({ productId, landed }: { productId: string; landed: CatalogMargin }) {
  const headingId = `landed-${productId}`;
  const g = landed.margin;
  const risk = resaleRisk(landed.resellability);
  const status =
    g.status === "shown" ? (
      <Chip tone="ok">Shown · confidence {conf(g.confidence)}</Chip>
    ) : g.reason === "Not Sellable" ? (
      <Chip tone="bad">{RISK_BADGE[risk ?? "ip"]}</Chip>
    ) : (
      <Chip tone="warn">Withheld</Chip>
    );
  return (
    <section aria-labelledby={headingId} className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-sm font-semibold text-slate-900 dark:text-white">
          Landed margin · UK
        </h3>
        {status}
      </div>
      <p className={`mt-1 text-sm ${muted}`}>
        {g.status === "shown"
          ? `Selling on ${CHANNEL[g.value.channel]}: the retail price less the supplier cost, ${pct(g.value.vat.rate * 100)} UK VAT and the platform's fees. Every line says how it's known; what can't be sourced is named, never guessed.`
          : "The retail price less the supplier cost, UK VAT and platform fees, from live sources only. Nothing is estimated while it's withheld."}
      </p>

      {g.status === "shown" ? (
        <Waterfall m={g.value} landed={landed} />
      ) : (
        <>
          <Blurred />
          <div className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-line-dark">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {g.reason === "Not Sellable"
                ? `${RISK_BADGE[risk ?? "ip"]}, so no margin is calculated`
                : g.confidence > 0 && g.confidence < FINANCIAL_THRESHOLD
                  ? `Withheld: the evidence's confidence is ${conf(g.confidence)}, below the ${conf(FINANCIAL_THRESHOLD)} numbers need`
                  : "Withheld: not enough evidence yet"}
            </p>
            {g.reason === "Not Sellable" ? (
              <p className={`mt-1 text-sm ${muted}`}>
                It fails {g.missing.length === 1 ? "a resale check" : `${g.missing.length} resale checks`} below, so no supplier cost is
                sourced and no money maths is shown.
              </p>
            ) : (
              <>
                <p className={`mt-1 text-xs ${muted}`}>Needs:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-slate-800 dark:text-slate-200">
                  {g.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}

      <div className="mt-4">
        <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Resale checks</h4>
        <p className={`text-xs ${muted}`}>Run first, on the product&apos;s own name, brand, category and description.</p>
        <ul className="mt-1 divide-y divide-gray-200 dark:divide-line-dark">
          {RESELLABILITY_ORDER.map((k) => (
            <CheckRow key={k} label={RESELLABILITY_LABEL[k]} flag={landed.resellability[k]} />
          ))}
        </ul>
      </div>
      <Sources landed={landed} />
      <p className={`mt-3 text-xs ${muted}`}>Checked {formatDateTime(landed.checkedAt)}. A calculated estimate, not a guarantee.</p>
    </section>
  );
}
