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
      <dl className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-zinc-200 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-800 ${cols}`}>
        {items.map((i) => (
          <div key={i.label} className="flex flex-col-reverse gap-1 bg-white px-4 py-5 text-center last:odd:col-span-2 sm:last:odd:col-span-1 dark:bg-zinc-900">
            <dt className="text-xs text-zinc-600 sm:text-sm dark:text-zinc-400">{i.label}</dt>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums text-zinc-950 sm:text-3xl dark:text-white">{count(i.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span aria-hidden="true" className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        Live counts from our database{stats.lastObservedAt && <> · newest capture {longDate(stats.lastObservedAt)}</>}
      </p>
    </div>
  );
}

export function LiveStatsSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-zinc-200 ring-1 ring-zinc-200 sm:grid-cols-4 dark:bg-zinc-800 dark:ring-zinc-800">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 bg-white px-4 py-5 dark:bg-zinc-900">
            <div className="h-8 w-14 animate-pulse rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
            <div className="h-3 w-24 animate-pulse rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
          </div>
        ))}
      </div>
      <div className="mx-auto mt-3 h-4 w-64 animate-pulse rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
    </div>
  );
}
