import type { ProductDto } from "@/server/products/service";
import {
  AVAILABILITY_LABEL,
  DIMENSION_HELP,
  DIMENSION_LABEL,
  SOURCE_TYPE_LABEL,
  formatMetric,
  formatPrice,
  type Dimension,
} from "./format";
import { RelativeTime } from "./relative-time";
import { ConfidenceBadge, ScoreBar } from "./score";

const DIM_ORDER: Dimension[] = ["OVERALL", "QUALITY", "VALUE", "DEMAND", "SENTIMENT", "TREND"];

const AVAILABILITY_STYLE: Record<string, string> = {
  IN_STOCK: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20",
  PREORDER: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20",
  OUT_OF_STOCK: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20",
  DISCONTINUED: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20",
  UNKNOWN: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20",
};

const badge = "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset";
const link =
  "rounded-sm font-medium text-purple-700 underline decoration-purple-300 underline-offset-2 hover:decoration-purple-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:text-purple-300 dark:decoration-purple-700 dark:hover:decoration-purple-300";

export function ProductDetail({ product }: { product: ProductDto }) {
  // Which scores each piece of evidence fed into — shown on every evidence row.
  const usedIn = new Map<string, Dimension[]>();
  for (const d of DIM_ORDER) {
    for (const id of product.scores[d]?.evidenceIds ?? []) {
      usedIn.set(id, [...(usedIn.get(id) ?? []), d]);
    }
  }
  const missing = DIM_ORDER.filter((d) => !product.scores[d]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="space-y-6">
        {product.description && (
          <p className="line-clamp-5 text-sm text-zinc-700 dark:text-zinc-300" title={product.description}>
            {product.description}
          </p>
        )}

        <section aria-labelledby={`scores-${product.id}`}>
          <h3 id={`scores-${product.id}`} className="text-sm font-semibold text-zinc-950 dark:text-white">
            Score breakdown
          </h3>
          <ul className="mt-3 space-y-3">
            {DIM_ORDER.flatMap((d) => {
              const s = product.scores[d];
              if (!s) return [];
              return (
                <li key={d}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{DIMENSION_LABEL[d]}</span>
                    <span className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
                      {s.value.toFixed(1)}
                      <span className="font-normal text-zinc-500 dark:text-zinc-400"> / 100</span>
                    </span>
                  </div>
                  <div className="mt-1">
                    <ScoreBar value={s.value} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                    <ConfidenceBadge confidence={s.confidence} />
                    <span>
                      {DIMENSION_HELP[d]} · {s.evidenceIds.length} evidence item{s.evidenceIds.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && (
            <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
              Not scored (not enough evidence): {missing.map((d) => DIMENSION_LABEL[d]).join(", ")}.
            </p>
          )}
        </section>

        <section aria-labelledby={`offers-${product.id}`}>
          <h3 id={`offers-${product.id}`} className="text-sm font-semibold text-zinc-950 dark:text-white">
            Offers
          </h3>
          {product.offers.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">No offers recorded.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
              {product.offers.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className={`${link} text-sm`}>
                      {o.merchant}
                      <span className="sr-only"> (opens in new tab)</span>
                    </a>
                    <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                      <RelativeTime iso={o.observedAt} prefix="Seen " />
                      {product.bestOffer?.id === o.id && " · Best current price"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
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
        <h3 id={`evidence-${product.id}`} className="text-sm font-semibold text-zinc-950 dark:text-white">
          Evidence{" "}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">
            ({product.evidenceCount > product.evidence.length
              ? `newest ${product.evidence.length} of ${product.evidenceCount}`
              : product.evidenceCount})
          </span>
        </h3>
        <ul className="mt-3 space-y-2">
          {product.evidence.map((e) => {
            const dims = usedIn.get(e.id) ?? [];
            return (
              <li
                key={e.id}
                className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm text-zinc-900 dark:text-zinc-100">{e.claim}</p>
                  {e.metric && (
                    <span className={`${badge} bg-purple-50 text-purple-800 ring-purple-600/20 dark:bg-purple-950/40 dark:text-purple-300 dark:ring-purple-400/20`}>
                      {formatMetric(e.metric)}
                    </span>
                  )}
                </div>
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <div className="flex gap-1">
                    <dt className="sr-only">Source</dt>
                    <dd>
                      <a href={e.source.url} target="_blank" rel="noopener noreferrer" className={link}>
                        {e.source.name}
                        <span className="sr-only"> (opens in new tab)</span>
                      </a>{" "}
                      · {SOURCE_TYPE_LABEL[e.source.type]}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Observed</dt>
                    <dd>
                      <RelativeTime iso={e.observedAt} />
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Quality</dt>
                    <dd className="tabular-nums">{e.qualityScore}/100</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Used in</dt>
                    <dd>{dims.length ? dims.map((d) => DIMENSION_LABEL[d]).join(", ") : "Context only, not used in a score"}</dd>
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
