import type { CatalogStats } from "@/server/products/service";

const count = (n: number) => n.toLocaleString("en-GB");
const longDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));

/** Headline counts, read live from the database. A zero is left out rather than shown as a claim. */
export function LiveStats({ stats }: { stats: CatalogStats }) {
  const items = [
    { value: stats.stores, label: stats.stores === 1 ? "store tracked" : "stores tracked" },
    { value: stats.products, label: stats.products === 1 ? "live product scored" : "live products scored" },
    { value: stats.priceGaps, label: stats.priceGaps === 1 ? "price gap between stores now" : "price gaps between stores now" },
    { value: stats.evidence, label: "evidence items, each sourced" },
  ].filter((i) => i.value > 0);
  const cols = ["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"][items.length];

  return (
    <div>
      {/* One bar: hairline dividers are the 1px gaps showing the bar's own background through. */}
      <dl
        className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-dark bg-line-dark ${cols}`}
      >
        {items.map((i) => (
          <div
            key={i.label}
            className="flex flex-col-reverse gap-1 bg-surface-dark px-4 py-5 text-center last:odd:col-span-2 sm:px-6 sm:last:odd:col-span-1"
          >
            <dt className="text-xs text-slate-400 sm:text-sm">{i.label}</dt>
            <dd className="text-3xl font-bold tracking-tight tabular-nums text-white sm:text-4xl">{count(i.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400">
        <span aria-hidden="true" className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-mint opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-accent-mint" />
        </span>
        Live counts from our database{stats.lastObservedAt && <> · newest capture {longDate(stats.lastObservedAt)}</>}
      </p>
    </div>
  );
}

export function LiveStatsSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-dark bg-line-dark sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 bg-surface-dark px-4 py-5">
            <div className="h-9 w-16 animate-pulse rounded bg-white/10 sm:h-10" />
            <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
          </div>
        ))}
      </div>
      <div className="mx-auto mt-3 h-4 w-64 animate-pulse rounded bg-white/10" />
    </div>
  );
}
