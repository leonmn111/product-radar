// The landing page's platform section: the three things the v2 engine does, as terminal-style panels.
// Each one's status is read from the live configuration on every request, so the page never says a
// feature is live before it is (and says LIVE the moment its key or connection is in place).

import { connection } from "next/server";
import { env } from "@/lib/env";
import { agencyOnSale } from "@/server/billing/sales";
import { liveSources } from "@/server/live/config";

export type Status = "LIVE" | "LAUNCHING SOON";

/** What each panel may claim: Momentum and Agency both need live Dossiers first. */
export function platformStatus(c: { dossiersLive: boolean; keepaKey: boolean; agencyOnSale: boolean }): { dossier: Status; momentum: Status; agency: Status } {
  return {
    dossier: c.dossiersLive ? "LIVE" : "LAUNCHING SOON",
    momentum: c.dossiersLive && c.keepaKey ? "LIVE" : "LAUNCHING SOON",
    agency: c.dossiersLive && c.agencyOnSale ? "LIVE" : "LAUNCHING SOON",
  };
}

const STATUS_TONE: Record<Status, string> = {
  LIVE: "text-accent-mint ring-accent-mint/30 bg-accent-mint/10",
  "LAUNCHING SOON": "text-amber-300 ring-amber-400/30 bg-amber-400/10",
};

const PARTS: [string, string][] = [
  ["01", "Verdict: LAUNCH / TEST / AVOID"],
  ["02", "Resellability: brand, trademark, UKCA, batteries"],
  ["03", "True landed margin: VAT, duty, fees, ROI"],
  ["04", "Momentum: 12-week sales trend"],
  ["05", "Saturation: sellers and stores"],
  ["06", "Supplier matches: AliExpress / 1688"],
  ["07", "Evidence: every source, time and quality"],
  ["08", "Exports: Shopify product CSV"],
];

function Panel({ n, title, status, children }: { n: string; title: string; status: Status; children: React.ReactNode }) {
  return (
    <article className="flex flex-col bg-surface-dark p-5 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <h3 className="font-mono text-xs font-semibold tracking-widest text-white uppercase">
          <span className="text-accent-mint">{n}</span> {title}
        </h3>
        <span className={`shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider ring-1 ring-inset ${STATUS_TONE[status]}`}>{status}</span>
      </header>
      <div className="mt-4 flex-1 text-sm/6 text-slate-300">{children}</div>
    </article>
  );
}

const bullet = "flex gap-2 before:mt-[0.6rem] before:size-1 before:shrink-0 before:rounded-full before:bg-accent-mint before:content-['']";

export async function Platform() {
  await connection(); // the statuses follow the live configuration, not the build
  const { dossier, momentum, agency } = platformStatus({ dossiersLive: liveSources().ready, keepaKey: Boolean(env.KEEPA_API_KEY), agencyOnSale: agencyOnSale() });

  return (
    <div className="grid gap-px overflow-hidden rounded-lg bg-line-dark ring-1 ring-line-dark lg:grid-cols-3">
      <Panel n="01" title="The 8-part Dossier" status={dossier}>
        <p>One Amazon UK product, eight parts, every number cited. The true landed margin counts VAT, EU duty, platform fees and ad costs.</p>
        <ol className="mt-4 space-y-1 font-mono text-xs text-slate-400">
          {PARTS.map(([n, label]) => (
            <li key={n}>
              <span className="text-slate-400/70">{n}</span> {label}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-slate-400">Meta ad signals (how long a product&apos;s ads have run) are in development.</p>
      </Panel>
      <Panel n="02" title="Momentum engine" status={momentum}>
        <p>Twelve weeks of Amazon sales-rank history (Keepa), fitted by least-squares regression, so you see where demand is heading.</p>
        <ul className="mt-4 space-y-1.5">
          <li className={bullet}>ACCELERATING, FLAT or DECELERATING, from the rank slope</li>
          <li className={bullet}>Price trend, in pence a week</li>
          <li className={bullet}>Sales velocity from Amazon&apos;s own &ldquo;bought in past month&rdquo; figure, never guessed</li>
        </ul>
      </Panel>
      <Panel n="03" title="Agency bulk processor" status={agency}>
        <p>Upload a CSV of up to 100 ASINs and get a Dossier for each, scored in the background.</p>
        <ul className="mt-4 space-y-1.5">
          <li className={bullet}>1 credit per product, taken up front, all or nothing</li>
          <li className={bullet}>Anything that can&apos;t be scored is refunded</li>
          <li className={bullet}>An email when the job is done, with every result in your library</li>
        </ul>
      </Panel>
    </div>
  );
}

export function PlatformSkeleton() {
  return <div aria-hidden="true" className="h-[26rem] animate-pulse rounded-lg bg-white/5 motion-reduce:animate-none lg:h-[22rem]" />;
}
