import type { ProductDto } from "@/server/products/service";
import {
  AVAILABILITY_LABEL,
  DIMENSION_HELP,
  DIMENSION_LABEL,
  SOURCE_TYPE_LABEL,
  formatMetric,
  formatPrice,
  roundRatings,
  type Dimension,
} from "./format";
import { RelativeTime } from "./relative-time";
import { ConfidenceBadge, ScoreBar } from "./score";

const DIM_ORDER: Dimension[] = ["OVERALL", "QUALITY", "VALUE", "DEMAND", "SENTIMENT", "TREND"];

const AVAILABILITY_STYLE: Record<string, string> = {
  IN_STOCK: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20",
  PREORDER: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20",
  OUT_OF_STOCK: "bg-gray-100 text-slate-700 ring-slate-500/20 dark:bg-surface-raised dark:text-slate-300 dark:ring-slate-400/20",
  DISCONTINUED: "bg-gray-100 text-slate-700 ring-slate-500/20 dark:bg-surface-raised dark:text-slate-300 dark:ring-slate-400/20",
  UNKNOWN: "bg-gray-100 text-slate-700 ring-slate-500/20 dark:bg-surface-raised dark:text-slate-300 dark:ring-slate-400/20",
};

const badge = "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset";
const link =
  "rounded-sm font-medium text-accent-mint underline decoration-accent-mint/40 underline-offset-2 hover:decoration-accent-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";

export function ProductDetail({ product }: { product: ProductDto }) {
  // Which scores each piece of evidence fed into — shown on every evidence row.
  const usedIn = new Map<string, Dimension[]>();
  for (const d of DIM_ORDER) {
    for (const id of product.scores[d]?.evidenceIds ?? []) {
      usedIn.set(id, [...(usedIn.get(id) ?? []), d]);
    }
  }
  const missing = DIM_ORDER.filter((d) => !product.scores[d]);
  // One entry per page: a page read four times is one source. It shows the newest reading of each
  // fact (evidence arrives newest first) and how many times the page was read.
  const byUrl = new Map<string, typeof product.evidence>();
  for (const e of product.evidence) byUrl.set(e.source.url, [...(byUrl.get(e.source.url) ?? []), e]);
  const pages = [...byUrl].map(([url, items]) => {
    const seen = new Set<string>();
    const facts = items.filter((e) => {
      const key = e.metric?.type ?? e.claim;
      return !seen.has(key) && seen.add(key);
    });
    return { url, items, facts, reads: new Set(items.map((e) => e.observedAt)).size };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="space-y-6">
        {product.description && (
          <p className="line-clamp-5 text-sm text-slate-700 dark:text-slate-300" title={product.description}>
            {product.description}
          </p>
        )}

        <section aria-labelledby={`scores-${product.id}`}>
          <h3 id={`scores-${product.id}`} className="text-sm font-semibold text-slate-900 dark:text-white">
            Score breakdown
          </h3>
          <ul className="mt-3 space-y-3">
            {DIM_ORDER.flatMap((d) => {
              const s = product.scores[d];
              if (!s) return [];
              return (
                <li key={d}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{DIMENSION_LABEL[d]}</span>
                    <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                      {s.value.toFixed(1)}
                      <span className="font-normal text-slate-400 dark:text-slate-400"> / 100</span>
                    </span>
                  </div>
                  <div className="mt-1">
                    <ScoreBar value={s.value} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <ConfidenceBadge confidence={s.confidence} />
                    <span>
                      {DIMENSION_HELP[d]} · {s.sourceCount} source{s.sourceCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && (
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
              Not scored (not enough evidence): {missing.map((d) => DIMENSION_LABEL[d]).join(", ")}.
            </p>
          )}
        </section>

        <section aria-labelledby={`offers-${product.id}`}>
          <h3 id={`offers-${product.id}`} className="text-sm font-semibold text-slate-900 dark:text-white">
            Offers
          </h3>
          {product.offers.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No offers recorded.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-200 dark:divide-line-dark">
              {product.offers.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className={`${link} text-sm`}>
                      {o.merchant}
                      <span className="sr-only"> (opens in new tab)</span>
                    </a>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                      <RelativeTime iso={o.observedAt} prefix="Seen " />
                      {product.bestOffer?.id === o.id && " · Best current price"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatPrice(o.price.amount, o.price.currency)}
                    </span>
                    <span className={`${badge} ${AVAILABILITY_STYLE[o.availability]}`}>
                      {AVAILABILITY_LABEL[o.availability]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby={`evidence-${product.id}`} className="min-w-0">
        <h3 id={`evidence-${product.id}`} className="text-sm font-semibold text-slate-900 dark:text-white">
          Evidence{" "}
          <span className="font-normal text-slate-400 dark:text-slate-400">
            ({pages.length} source{pages.length === 1 ? "" : "s"}
            {product.evidenceCount > product.evidence.length ? `, from the newest ${product.evidence.length} readings` : ""})
          </span>
        </h3>
        <ul className="mt-3 space-y-2">
          {pages.map((page) => {
            const latest = page.items[0];
            const dims = [...new Set(page.items.flatMap((e) => usedIn.get(e.id) ?? []))];
            return (
              <li key={page.url} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-line-dark dark:bg-surface-dark">
                <ul className="space-y-1.5">
                  {page.facts.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm text-slate-900 dark:text-slate-100">{roundRatings(e.claim)}</p>
                      {e.metric && <span className={`${badge} bg-accent-mint/10 text-accent-mint ring-accent-mint/20`}>{formatMetric(e.metric)}</span>}
                    </li>
                  ))}
                </ul>
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex gap-1">
                    <dt className="sr-only">Source</dt>
                    <dd>
                      <a href={page.url} target="_blank" rel="noopener noreferrer" className={link}>
                        {latest.source.name}
                        <span className="sr-only"> (opens in new tab)</span>
                      </a>{" "}
                      · {SOURCE_TYPE_LABEL[latest.source.type]}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Last read</dt>
                    <dd>
                      <RelativeTime iso={latest.observedAt} />
                      {page.reads > 1 ? ` · read ${page.reads} times` : ""}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Quality</dt>
                    <dd className="tabular-nums">{latest.qualityScore}/100</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Used in</dt>
                    <dd>{dims.length ? DIM_ORDER.filter((d) => dims.includes(d)).map((d) => DIMENSION_LABEL[d]).join(", ") : "Context only, not used in a score"}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
