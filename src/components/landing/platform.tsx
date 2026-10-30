// The landing page's platform section: what the v2 engine does, as terminal-style panels. A panel shows
// only once its feature is live (read from the configuration on every request), so the page never
// advertises something that isn't available, and there are no "launching soon" badges.

import { connection } from "next/server";
import { cloneElement } from "react";
import { env } from "@/lib/env";
import { creditsGbp } from "@/server/billing/plans";
import { agencyOnSale } from "@/server/billing/sales";
import { liveSources } from "@/server/live/config";
import { BULK_CREDITS_PER_ASIN } from "@/services/bulkJobs";

/** Which panels may show: Momentum and Agency both need live Dossiers first. */
export function platformStatus(c: { dossiersLive: boolean; keepaKey: boolean; agencyOnSale: boolean }): { dossier: boolean; momentum: boolean; agency: boolean } {
  return {
    dossier: c.dossiersLive,
    momentum: c.dossiersLive && c.keepaKey,
    agency: c.dossiersLive && c.agencyOnSale,
  };
}

const PARTS: [string, string][] = [
  ["01", "Verdict: Launch / Test small / Avoid"],
  ["02", "Resellability: brand, trademark, UKCA, batteries"],
  ["03", "True landed margin: VAT, duty, fees, ROI"],
  ["04", "Momentum: 12-week sales trend"],
  ["05", "Saturation: sellers and stores"],
  ["06", "Supplier matches: AliExpress"],
  ["07", "Evidence: every source, time and quality"],
  ["08", "Exports: Shopify product CSV"],
];

function Panel({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col bg-surface-dark p-5 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <h3 className="font-mono text-xs font-semibold tracking-widest text-white uppercase">
          <span className="text-accent-mint">{String(n).padStart(2, "0")}</span> {title}
        </h3>
      </header>
      <div className="mt-4 flex-1 text-sm/6 text-slate-300">{children}</div>
    </article>
  );
}

const bullet = "flex gap-2 before:mt-[0.6rem] before:size-1 before:shrink-0 before:rounded-full before:bg-accent-mint before:content-['']";

export async function Platform() {
  await connection(); // the panels follow the live configuration, not the build
  const live = platformStatus({ dossiersLive: liveSources().ready, keepaKey: Boolean(env.KEEPA_API_KEY), agencyOnSale: agencyOnSale() });
  const panels = [
    live.dossier && (
      <Panel key="dossier" n={0} title="The 8-part Dossier">
        <p>One Amazon UK product, eight parts, every number cited. The true landed margin counts UK VAT, duty, the platform&apos;s fees and the creator cut, and shows the most a sale can spend on ads.</p>
        <ol className="mt-4 space-y-1 font-mono text-xs text-slate-400">
          {PARTS.map(([n, label]) => (
            <li key={n}>
              <span className="text-slate-400/70">{n}</span> {label}
            </li>
          ))}
        </ol>
      </Panel>
    ),
    live.momentum && (
      <Panel key="momentum" n={0} title="Momentum engine">
        <p>Twelve weeks of Amazon sales-rank history (Keepa), fitted by least-squares regression, so you see where demand is heading.</p>
        <ul className="mt-4 space-y-1.5">
          <li className={bullet}>ACCELERATING, FLAT or DECELERATING, from the rank slope</li>
          <li className={bullet}>Price trend, in pence a week</li>
          <li className={bullet}>Sales velocity from Amazon&apos;s own &ldquo;bought in past month&rdquo; figure, never guessed</li>
        </ul>
      </Panel>
    ),
    live.agency && (
      <Panel key="agency" n={0} title="Agency bulk processor">
        <p>Upload a CSV of up to 100 ASINs and get a Dossier for each, scored in the background.</p>
        <ul className="mt-4 space-y-1.5">
          <li className={bullet}>{creditsGbp(BULK_CREDITS_PER_ASIN)} per product from your balance, taken up front, all or nothing</li>
          <li className={bullet}>Anything that can&apos;t be scored is refunded</li>
          <li className={bullet}>An email when the job is done, with every result in your library</li>
        </ul>
      </Panel>
    ),
  ].filter((p) => p !== false);
  if (panels.length === 0) return null;
  const cols = ["", "", "lg:grid-cols-2", "lg:grid-cols-3"][panels.length];
  // Numbered in the order shown, so a hidden panel leaves no gap.
  return (
    <div className={`grid gap-px overflow-hidden rounded-lg bg-line-dark ring-1 ring-line-dark ${cols}`}>
      {panels.map((p, i) => cloneElement(p, { n: i + 1 }))}
    </div>
  );
}

export function PlatformSkeleton() {
  return <div aria-hidden="true" className="h-[26rem] animate-pulse rounded-lg bg-white/5 motion-reduce:animate-none lg:h-[22rem]" />;
}
