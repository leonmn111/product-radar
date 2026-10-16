// The 8-part Dossier as a dense, data-first terminal (playbook: "calm, data-first, like a Bloomberg
// terminal"). One panel per part. Renders only what the Dossier holds: a withheld part shows why and
// what evidence it still needs, never an estimate (CLAUDE.md Rule 5).
//
// The strict UI gate: when the Verdict is withheld, a "VERDICT WITHHELD" warning is shown and the
// margin panel shows a blurred placeholder. The placeholder holds no numbers (a withheld part has
// none), and the margin is never drawn while the Verdict is withheld, whatever the margin says.

import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { FINANCIAL_THRESHOLD, VERDICT_THRESHOLD } from "@/engine/confidence";
import type { ComplianceFlag, Dossier, Evidence, Gated, ResellabilityFlags, VerdictKind } from "@/types/dossier";
import type { LandedMargin, LineBasis, Money } from "@/types/financials";

const inter = Inter({ subsets: ["latin"], display: "swap" });

// ── Formatting (UTC, so server and browser agree) ────────────────────────────

const money = (m: Money) => new Intl.NumberFormat("en-GB", { style: "currency", currency: m.currency }).format(m.amount);
const pct = (n: number) => `${n.toFixed(1)}%`;
const conf = (c: number) => c.toFixed(2);
const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";
const link = `underline decoration-zinc-400 underline-offset-2 hover:decoration-purple-500 dark:decoration-zinc-600 ${focusRing}`;
const muted = "text-zinc-600 dark:text-zinc-400";
const num = "font-mono tabular-nums";

// ── Building blocks ──────────────────────────────────────────────────────────

type Tone = "ok" | "warn" | "bad" | "off";
const TONE: Record<Tone, string> = {
  ok: "text-emerald-700 ring-emerald-600/30 bg-emerald-50 dark:text-emerald-300 dark:ring-emerald-400/30 dark:bg-emerald-400/10",
  warn: "text-amber-800 ring-amber-600/30 bg-amber-50 dark:text-amber-300 dark:ring-amber-400/30 dark:bg-amber-400/10",
  bad: "text-red-700 ring-red-600/30 bg-red-50 dark:text-red-300 dark:ring-red-400/30 dark:bg-red-400/10",
  off: "text-zinc-700 ring-zinc-400/40 bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-500/40 dark:bg-zinc-800",
};

function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase ring-1 ring-inset ${TONE[tone]}`}>{children}</span>;
}

function Panel({ n, title, status, className = "", children }: { n: number; title: string; status: ReactNode; className?: string; children: ReactNode }) {
  const id = `dossier-part-${n}`;
  return (
    <section aria-labelledby={id} className={`flex min-w-0 flex-col bg-white dark:bg-zinc-950 ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <h3 id={id} className="font-mono text-[11px] font-semibold tracking-widest text-zinc-900 uppercase dark:text-zinc-100">
          <span className="text-purple-700 dark:text-purple-400">{String(n).padStart(2, "0")}</span> {title}
        </h3>
        {status}
      </header>
      <div className="min-w-0 flex-1 p-3 text-[13px] leading-snug">{children}</div>
    </section>
  );
}

const gateTag = (g: Gated<unknown>) =>
  g.status === "shown" ? <Tag tone="ok">Shown {conf(g.confidence)}</Tag> : <Tag tone={g.reason === "Not Sellable" ? "bad" : "warn"}>Withheld</Tag>;

/** Why a part is withheld: the reason, the confidence against its gate, and the evidence it needs. */
function WithheldNote({ part, gate }: { part: Extract<Gated<unknown>, { status: "withheld" }>; gate: number }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs font-semibold tracking-wide uppercase">
        {part.reason === "Not Sellable"
          ? "Not sellable: financials halted"
          : part.confidence < gate
            ? `Insufficient data: confidence ${conf(part.confidence)} < ${conf(gate)}`
            : "Insufficient data: not collected yet"}
      </p>
      {part.missing.length > 0 && (
        <div>
          <p className={`text-xs ${muted}`}>{part.reason === "Not Sellable" ? "Because:" : "Needs:"}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
            {part.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Stands in for withheld margin figures: bars only, no digits, hidden from screen readers. */
function BlurredMargin() {
  const rows = ["w-24", "w-40", "w-32", "w-36", "w-28", "w-20"];
  return (
    <div aria-hidden="true" className="pointer-events-none blur-sm select-none" data-testid="margin-blurred">
      <div className="space-y-2 py-1">
        {rows.map((w, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className={`h-2.5 ${w} rounded-sm bg-zinc-300 dark:bg-zinc-700`} />
            <div className="h-2.5 w-14 rounded-sm bg-zinc-300 dark:bg-zinc-700" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Parts ────────────────────────────────────────────────────────────────────

const VERDICT_TEXT: Record<VerdictKind, string> = {
  LAUNCH: "text-emerald-700 dark:text-emerald-300",
  TEST: "text-amber-700 dark:text-amber-300",
  AVOID: "text-red-700 dark:text-red-300",
};

function VerdictPanel({ verdict }: { verdict: Dossier["verdict"] }) {
  if (verdict.status === "withheld") {
    return (
      <div className="space-y-3">
        <div role="note" className="rounded-sm border-l-4 border-amber-500 bg-amber-50 px-3 py-2 dark:border-amber-400 dark:bg-amber-400/10">
          <p className="font-mono text-xs font-bold tracking-wide text-amber-900 dark:text-amber-200">VERDICT WITHHELD: Insufficient Market Evidence</p>
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">
            Confidence <span className={num}>{conf(verdict.confidence)}</span> is below the <span className={num}>{conf(VERDICT_THRESHOLD)}</span> needed for a verdict.
          </p>
        </div>
        <WithheldNote part={verdict} gate={VERDICT_THRESHOLD} />
      </div>
    );
  }
  const v = verdict.value;
  return (
    <div className="space-y-2">
      <p className="flex items-baseline gap-3">
        <span className={`font-mono text-3xl font-bold tracking-tight ${VERDICT_TEXT[v.kind]}`}>{v.kind}</span>
        <span className={`text-xs ${muted}`}>
          confidence <span className={num}>{conf(verdict.confidence)}</span>
        </span>
      </p>
      <ul className="list-disc space-y-1 pl-4 text-xs">
        {v.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

const FLAG_LABEL: Record<keyof ResellabilityFlags, string> = {
  brandDirect: "Brand-direct",
  trademarkRisk: "Trademark",
  requiresUKCA: "UKCA / CE",
  cosmetics: "Cosmetics",
  batteries: "Batteries",
};
const flagTag = (f: ComplianceFlag) =>
  f.value === true ? <Tag tone="bad">Tripped</Tag> : f.value === false ? <Tag tone="ok">Clear</Tag> : <Tag tone="off">Unknown</Tag>;

function ResellabilityPanel({ flags }: { flags: ResellabilityFlags }) {
  return (
    <dl className="divide-y divide-zinc-100 dark:divide-zinc-900">
      {(Object.keys(FLAG_LABEL) as (keyof ResellabilityFlags)[]).map((k) => (
        <div key={k} className="py-1.5 first:pt-0 last:pb-0">
          <dt className="flex items-center justify-between gap-2 font-medium">
            {FLAG_LABEL[k]} {flagTag(flags[k])}
          </dt>
          <dd className={`mt-0.5 text-xs ${muted}`}>{flags[k].reason}</dd>
        </div>
      ))}
    </dl>
  );
}

const BASIS: Record<LineBasis, string> = { sourced: "sourced", caller_supplied: "yours", estimate: "estimate" };

function MarginTable({ m }: { m: LandedMargin }) {
  const row = (label: ReactNode, value: ReactNode, strong = false) => (
    <tr className={strong ? "font-semibold" : ""}>
      <th scope="row" className="py-0.5 pr-3 text-left font-normal">
        {label}
      </th>
      <td className={`py-0.5 text-right ${num}`}>{value}</td>
    </tr>
  );
  return (
    <div className="min-w-0">
      <p className={`mb-1 font-mono text-[11px] tracking-wider uppercase ${muted}`}>
        {m.market} · {m.country} · {m.channel.replaceAll("_", " ")} · VAT <span className={num}>{pct(m.vat.rate * 100)}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {row("Retail price", money(m.retailPrice), true)}
            {m.lines.map((l) => (
              <tr key={`${l.kind}-${l.label}`}>
                <th scope="row" className="py-0.5 pr-3 text-left font-normal">
                  {l.label} <span className={`ml-1 font-mono text-[10px] uppercase ${l.basis === "estimate" ? "text-amber-700 dark:text-amber-300" : muted}`}>{BASIS[l.basis]}</span>
                </th>
                <td className={`py-0.5 text-right ${num}`}>−{money(l.amount)}</td>
              </tr>
            ))}
            {row("Landed cost per unit", money(m.landedCost))}
            {row("Net profit per unit", money(m.netProfit), true)}
            {row("Net margin", pct(m.netMarginPct))}
            {row("Return on landed cost", pct(m.roiPercentage))}
            {row("Break-even ad cost per sale", money(m.breakEvenAdCost))}
          </tbody>
        </table>
      </div>
      {m.excluded.length > 0 && (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
          Not counted (couldn&apos;t be sourced): {m.excluded.map((x) => x.label.toLowerCase()).join(", ")}.
        </p>
      )}
    </div>
  );
}

function MarginPanel({ margin, verdictWithheld }: { margin: Dossier["landedMargin"]; verdictWithheld: boolean }) {
  // The strict UI gate: no margin figures while the Verdict is withheld.
  if (verdictWithheld || margin.status === "withheld") {
    return (
      <div className="relative">
        <BlurredMargin />
        <div className="mt-3">
          {margin.status === "withheld" ? (
            <WithheldNote part={margin} gate={FINANCIAL_THRESHOLD} />
          ) : (
            <p className="font-mono text-xs font-semibold uppercase">Hidden while the verdict is withheld</p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <MarginTable m={margin.value.uk} />
      {margin.value.eu ? <MarginTable m={margin.value.eu} /> : <p className={`text-xs ${muted}`}>No EU margin: it needs EU listings and supplier prices in EUR.</p>}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="py-1">
      <dt className={`font-mono text-[11px] tracking-wider uppercase ${muted}`}>{label}</dt>
      <dd className={`text-lg font-semibold ${num}`}>{value}</dd>
      {note && <dd className={`text-xs ${muted}`}>{note}</dd>}
    </div>
  );
}

function MomentumPanel({ momentum }: { momentum: Dossier["momentum"] }) {
  if (momentum.status === "withheld") return <WithheldNote part={momentum} gate={FINANCIAL_THRESHOLD} />;
  const m = momentum.value;
  return (
    <dl>
      <Stat label="12-week trend slope" value={`${m.trendSlope12w >= 0 ? "+" : ""}${m.trendSlope12w.toFixed(2)}/wk`} />
      <Stat label="Sales velocity" value={`${m.salesVelocity.unitsPerMonth.toLocaleString("en-GB")}/mo`} note={m.salesVelocity.method} />
      <Stat label="Longest-running ad" value={m.adDurationDays === null ? "—" : `${m.adDurationDays} d`} note={m.adDurationDays === null ? "no ad data" : undefined} />
    </dl>
  );
}

function SaturationPanel({ saturation }: { saturation: Dossier["saturation"] }) {
  if (saturation.status === "withheld") return <WithheldNote part={saturation} gate={FINANCIAL_THRESHOLD} />;
  const s = saturation.value;
  return (
    <dl>
      <Stat label="Sellers, same product" value={s.sellerCount} />
      <Stat label="Distinct stores" value={s.storeCount} />
      <Stat label="Ad density" value={s.adDensity === null ? "—" : s.adDensity.toFixed(2)} note={s.adDensity === null ? "no ad data" : "active ads per seller"} />
    </dl>
  );
}

function SuppliersPanel({ matches }: { matches: Dossier["supplierMatches"] }) {
  if (matches.length === 0) return <p className={`text-xs ${muted}`}>No supplier listing matches this product.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className={`font-mono text-[10px] tracking-wider uppercase ${muted}`}>
          <tr>
            <th scope="col" className="pb-1 text-left font-medium">Listing</th>
            <th scope="col" className="pb-1 pl-2 text-right font-medium">Unit</th>
            <th scope="col" className="pb-1 pl-2 text-right font-medium">MOQ</th>
            <th scope="col" className="pb-1 pl-2 text-right font-medium">Days</th>
            <th scope="col" className="pb-1 pl-2 text-right font-medium">Match</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {matches.map((s) => (
            <tr key={s.listingUrl}>
              <td className="max-w-[16rem] py-1 pr-3">
                <a href={s.listingUrl} target="_blank" rel="noopener noreferrer" className={`line-clamp-2 ${link}`}>
                  {s.title}
                </a>
                <span className={`font-mono text-[10px] uppercase ${muted}`}>{s.platform}</span>
              </td>
              <td className={`py-1 pl-2 text-right ${num}`}>{money(s.unitPrice)}</td>
              <td className={`py-1 pl-2 text-right ${num}`}>{s.moq ?? "—"}</td>
              <td className={`py-1 pl-2 text-right ${num}`}>{s.deliveryDays ? `${s.deliveryDays.min}–${s.deliveryDays.max}` : "—"}</td>
              <td className={`py-1 pl-2 text-right ${num}`}>{conf(s.matchScore)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvidencePanel({ evidence }: { evidence: Evidence[] }) {
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-xs">
        <thead className={`sticky top-0 bg-white font-mono text-[10px] tracking-wider uppercase dark:bg-zinc-950 ${muted}`}>
          <tr>
            <th scope="col" className="pb-1 text-left font-medium">Claim</th>
            <th scope="col" className="pb-1 text-left font-medium">Source</th>
            <th scope="col" className="pb-1 text-right font-medium">Observed</th>
            <th scope="col" className="pb-1 pl-3 text-right font-medium">
              <abbr title="Quality, 0–100">Q</abbr>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {evidence.map((e) => (
            <tr key={e.id} className="align-top">
              <td className="min-w-[14rem] py-1 pr-3">
                {e.claim}
                {e.imageMatch && (
                  <span className="ml-1">
                    <Tag tone={e.imageMatch.method === "simulated" ? "warn" : "off"}>
                      image {conf(e.imageMatch.score)} {e.imageMatch.method}
                    </Tag>
                  </span>
                )}
              </td>
              <td className="py-1 pr-3 whitespace-nowrap">
                <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className={link}>
                  {e.provider}
                </a>
                <span className={`block font-mono text-[10px] uppercase ${muted}`}>{e.sourceType}</span>
              </td>
              <td className={`py-1 text-right whitespace-nowrap ${num}`}>{utc(e.observedAt)}</td>
              <td className={`py-1 pl-3 text-right ${num}`}>{e.quality}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportsPanel({ exports }: { exports: Dossier["exports"] }) {
  const items: [string, string | null][] = [
    ["Shopify CSV", exports.shopifyCsvUrl],
    ["PDF", exports.pdfUrl],
    ["Share link", exports.shareLink],
  ];
  return (
    <ul className="space-y-1.5">
      {items.map(([label, url]) => (
        <li key={label} className="flex items-center justify-between gap-2">
          {url ? (
            <a href={url} className={`font-medium ${link}`}>
              {label}
            </a>
          ) : (
            <span className={muted}>{label}</span>
          )}
          {url ? <Tag tone="ok">Ready</Tag> : <Tag tone="off">Not yet</Tag>}
        </li>
      ))}
    </ul>
  );
}

// ── The terminal ─────────────────────────────────────────────────────────────

export function DossierTerminal({ dossier }: { dossier: Dossier }) {
  const d = dossier;
  const verdictWithheld = d.verdict.status !== "shown";
  const tripped = Object.values(d.resellability).filter((f) => f.value === true).length;
  return (
    <article
      aria-label={`Dossier: ${d.product.title}`}
      className={`${inter.className} overflow-hidden rounded-md bg-zinc-200 text-zinc-900 ring-1 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-800`}
    >
      <header className="space-y-1 bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2">
          {d.sample && <Tag tone="warn">Sample data: not real</Tag>}
          <span className={`font-mono text-[11px] tracking-wider uppercase ${muted}`}>
            {d.product.market} · {d.product.country} · {d.product.currency}
            {d.product.identifiers.asin && <> · ASIN {d.product.identifiers.asin}</>}
          </span>
        </div>
        <h2 className="text-base leading-tight font-semibold sm:text-lg">{d.product.title}</h2>
        <p className={`font-mono text-[11px] ${muted}`}>
          Generated {utc(d.generatedAt)} · id {d.id.slice(0, 12)} · confidence <span className={num}>{conf(d.verdict.confidence)}</span> (verdict
          from {conf(VERDICT_THRESHOLD)}, numbers from {conf(FINANCIAL_THRESHOLD)})
        </p>
        {d.notes.length > 0 && (
          <ul className={`list-disc pl-4 text-xs ${muted}`}>
            {d.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </header>

      <div className="grid grid-cols-1 gap-px border-t border-zinc-300 md:grid-cols-2 xl:grid-cols-4 dark:border-zinc-800">
        <Panel n={1} title="Verdict" status={gateTag(d.verdict)}>
          <VerdictPanel verdict={d.verdict} />
        </Panel>
        <Panel n={2} title="Resellability" status={tripped ? <Tag tone="bad">{tripped} tripped</Tag> : <Tag tone="ok">Clear</Tag>}>
          <ResellabilityPanel flags={d.resellability} />
        </Panel>
        <Panel n={3} title="Landed margin" status={verdictWithheld ? <Tag tone="warn">Withheld</Tag> : gateTag(d.landedMargin)} className="md:col-span-2">
          <MarginPanel margin={d.landedMargin} verdictWithheld={verdictWithheld} />
        </Panel>
        <Panel n={4} title="Momentum" status={gateTag(d.momentum)}>
          <MomentumPanel momentum={d.momentum} />
        </Panel>
        <Panel n={5} title="Saturation" status={gateTag(d.saturation)}>
          <SaturationPanel saturation={d.saturation} />
        </Panel>
        <Panel n={6} title="Supplier matches" status={<Tag tone={d.supplierMatches.length ? "ok" : "off"}>{d.supplierMatches.length} of 3</Tag>} className="md:col-span-2">
          <SuppliersPanel matches={d.supplierMatches} />
        </Panel>
        <Panel n={7} title="Evidence" status={<Tag tone="off">{d.evidence.length === 1 ? "1 item" : `${d.evidence.length} items`}</Tag>} className="md:col-span-2 xl:col-span-3">
          <EvidencePanel evidence={d.evidence} />
        </Panel>
        <Panel n={8} title="Exports" status={<Tag tone="off">Gated</Tag>} className="md:col-span-2 xl:col-span-1">
          <ExportsPanel exports={d.exports} />
        </Panel>
      </div>
    </article>
  );
}
