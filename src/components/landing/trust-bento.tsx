// The landing page's three guarantees as a bento grid: the landed margin (the big tile), compliance and the
// confidence gates. Each tile pairs the claim with a picture of the method, never with figures: real numbers
// only ever come from a real Dossier (CLAUDE.md Rule 3). Server Component; the hover effects are pure CSS.

import type { ReactNode } from "react";

/** One tile: a midnight glass panel with an inner top highlight; on hover it lifts, its edge lights mint and a soft glow rises. */
function Tile({ className = "", icon, title, body, children }: { className?: string; icon: string; title: string; body: string; children: ReactNode }) {
  return (
    <article
      className={`group relative isolate flex flex-col overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-surface-dark to-background-dark p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_20px_40px_-24px_rgba(0,0,0,0.7)] transition duration-300 ease-out hover:-translate-y-1 hover:border-accent-mint/30 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_28px_60px_-28px_rgba(0,191,165,0.25)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-8 ${className}`}
    >
      {/* The glow that rises on hover, and a mint hairline along the top edge. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(640px_circle_at_50%_-10%,rgba(0,191,165,0.12),transparent_60%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-accent-mint/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none"
      />
      <span className="flex size-11 items-center justify-center rounded-xl bg-accent-mint/10 text-accent-mint ring-1 ring-accent-mint/20 ring-inset">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5">
          <path d={icon} />
        </svg>
      </span>
      <h3 className="mt-5 text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</h3>
      <p className="mt-2 max-w-prose text-sm/6 text-slate-400">{body}</p>
      <div className="mt-6 flex flex-1 flex-col">{children}</div>
    </article>
  );
}

// Every line the landed margin is built from, and where each comes from (ARCHITECTURE.md, the margin model).
const LEDGER: [string, string][] = [
  ["Selling price", "Amazon UK · live"],
  ["Supplier cost", "AliExpress · live"],
  ["Import duty", "UK and EU customs rules"],
  ["VAT", "GOV.UK and EU rates"],
  ["Platform fees", "published fee schedule"],
  ["Ad spend", "break-even per sale"],
  ["Shipping", "counted when quoted"],
];

const CHECKS = ["Brand selling direct", "Trademark risk", "UKCA / CE marking", "Cosmetics rules", "Battery rules"];

const ICONS = {
  ledger: "M3 3v18h18M7.5 15.75l3-3 3 3 5.25-5.25M15 10.5h3.75v3.75",
  shield: "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
  gauge: "M12 21a9 9 0 1 1 9-9M12 12l4.5-4.5M3.75 12h1.5m13.5 0h1.5M12 3.75v1.5",
};

export function TrustBento() {
  return (
    <div className="grid gap-4 md:grid-cols-6 md:grid-rows-2">
      <Tile
        className="md:col-span-4 md:row-span-2"
        icon={ICONS.ledger}
        title="True landed margin, every line sourced"
        body="Live Amazon UK prices and listings, cross-referenced with live AliExpress supplier costs, then VAT, import duty, platform fees and the most each sale can spend on ads. A cost that can't be sourced is named, never guessed."
      >
        <figure className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-background-dark/70 font-mono text-[11px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] sm:text-[0.8rem]">
          <figcaption className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-2.5 text-[10px] tracking-widest text-slate-400 uppercase sm:px-4 sm:text-[11px]">
            <span className="truncate">Landed margin · how it&apos;s built</span>
            <span className="shrink-0 text-accent-mint">UK + EU</span>
          </figcaption>
          {/* The rows share whatever height the tile has, so the ledger always fills it. */}
          <dl className="flex flex-1 flex-col divide-y divide-white/[0.04]">
            {LEDGER.map(([line, source]) => (
              <div key={line} className="flex flex-1 items-center justify-between gap-3 px-3 py-2.5 transition-colors group-hover:bg-white/[0.015] sm:px-4">
                <dt className="whitespace-nowrap text-slate-200">{line}</dt>
                <span aria-hidden="true" className="hidden min-w-4 flex-1 border-b border-dotted border-white/10 sm:block" />
                <dd className="flex items-center gap-2 text-right whitespace-nowrap text-slate-400">
                  {source}
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-3.5 shrink-0 text-accent-mint">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                  </svg>
                </dd>
              </div>
            ))}
          </dl>
          <p className="flex flex-col gap-1 border-t border-accent-mint/20 bg-accent-mint/[0.06] px-3 py-3 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
            <span className="font-semibold">Net profit · ROI · break-even</span>
            <span className="text-accent-mint">every number cited</span>
          </p>
        </figure>
      </Tile>

      <Tile
        className="md:col-span-2"
        icon={ICONS.shield}
        title="UK and EU compliance, checked first"
        body="Before any money maths, each product is checked for resale risk. A product you can't resell gets no margin."
      >
        <ul className="mt-auto flex flex-wrap gap-2">
          {CHECKS.map((c) => (
            <li
              key={c}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-slate-300 transition-colors group-hover:border-accent-mint/25"
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-mint" />
              {c}
            </li>
          ))}
        </ul>
      </Tile>

      <Tile
        className="md:col-span-2"
        icon={ICONS.gauge}
        title="Gated by confidence, never padded"
        body="Below its gate, a part is withheld and the Dossier says what evidence is missing. Nothing is a guarantee."
      >
        {/* The real thresholds on a 0–1 confidence scale: the verdict from 0.5, every number from 0.7. */}
        <figure className="mt-auto">
          <div className="relative h-2 rounded-full bg-white/[0.06]" role="img" aria-label="Confidence from 0 to 1: a verdict is shown from 0.5, every number from 0.7">
            <div className="absolute inset-y-0 left-1/2 right-0 rounded-r-full bg-accent-mint/25" />
            <div className="absolute inset-y-0 left-[70%] right-0 rounded-r-full bg-accent-mint/60" />
            <span className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background-dark bg-accent-mint/70" />
            <span className="absolute top-1/2 left-[70%] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background-dark bg-accent-mint" />
          </div>
          <figcaption aria-hidden="true" className="relative mt-3 h-8 font-mono text-[11px] text-slate-400">
            <span className="absolute left-0">0</span>
            <span className="absolute left-1/2 -translate-x-1/2 text-center">
              0.5
              <span className="block text-slate-300">verdict</span>
            </span>
            <span className="absolute left-[70%] -translate-x-1/2 text-center">
              0.7
              <span className="block text-accent-mint">numbers</span>
            </span>
            <span className="absolute right-0">1</span>
          </figcaption>
        </figure>
      </Tile>
    </div>
  );
}
