"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { IngestResult } from "@/server/ingest/ingest";
import type { ProductDto } from "@/server/products/service";
import {
  DIMENSION_LABEL,
  SUB_DIMENSIONS,
  dossierHref,
  formatPrice,
  getScore,
  humanizeSlug,
  type Dimension,
} from "./format";
import { IngestForm } from "./ingest-form";
import { CardGridSkeleton, ProductCard } from "./product-card";
import { ScoreCell } from "./score";
import { UpgradeCard } from "./upgrade-card";

type ApiResponse = {
  data: ProductDto[];
  meta: {
    count: number;
    category: string | null;
    methodologyVersion: string;
    disclaimer: string;
  };
};

type SortKey = Dimension | "PRICE";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "OVERALL", label: "Overall score" },
  { key: "QUALITY", label: "Quality" },
  { key: "VALUE", label: "Value" },
  { key: "DEMAND", label: "Demand" },
  { key: "SENTIMENT", label: "Sentiment" },
  { key: "TREND", label: "Trend" },
  { key: "PRICE", label: "Lowest price" },
];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";

// ── Data ─────────────────────────────────────────────────────────────────────

function useProducts(category: string | null) {
  const url = `/api/products?limit=50${category ? `&category=${encodeURIComponent(category)}` : ""}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; url: string; data?: ApiResponse; error?: string }>({
    key: "",
    url: "",
  });
  const key = `${url}#${attempt}`;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`The server responded with ${res.status}.`);
        return (await res.json()) as ApiResponse;
      })
      .then((data) => setResult({ key, url, data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setResult({ key, url, error: err instanceof Error ? err.message : "Unknown error." });
      });
    return () => ctrl.abort();
  }, [url, key]);

  // While refreshing the same list (e.g. after an ingest) keep showing the
  // previous rows instead of flashing a skeleton.
  const sameList = result.url === url;
  const fresh = result.key === key;
  return {
    data: sameList ? result.data : undefined,
    error: fresh ? result.error : undefined,
    loading: !sameList || (!fresh && !result.data),
    refreshing: sameList && !fresh && Boolean(result.data),
    refresh: () => setAttempt((n) => n + 1),
  };
}

function sortProducts(products: ProductDto[], key: SortKey) {
  const metric = (p: ProductDto): number | null =>
    key === "PRICE"
      ? p.bestOffer
        ? Number(p.bestOffer.price.amount)
        : null
      : (getScore(p, key)?.value ?? null);
  const dir = key === "PRICE" ? 1 : -1;
  // Prices in different currencies aren't comparable, so group by currency first.
  const currency = (p: ProductDto) => (key === "PRICE" ? (p.bestOffer?.price.currency ?? "") : "");
  return [...products].sort((a, b) => {
    const x = metric(a);
    const y = metric(b);
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1; // missing data always sorts last
    if (y === null) return -1;
    return currency(a).localeCompare(currency(b)) || (x - y) * dir || a.name.localeCompare(b.name);
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export type DashboardViewer = { signedIn: boolean; canIngest: boolean };

export function ProductDashboard({ viewer }: { viewer: DashboardViewer }) {
  const [category, setCategory] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("OVERALL");
  const [knownCategories, setKnownCategories] = useState<string[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards"); // the table is a wide-screen option
  const { data, error, loading, refreshing, refresh } = useProducts(category);

  // Remember categories from the unfiltered list so the tabs stay put while filtering.
  const allCategories = category === null && data ? [...new Set(data.data.map((p) => p.category))].sort() : null;
  if (allCategories && allCategories.join() !== knownCategories.join()) setKnownCategories(allCategories);

  const products = useMemo(() => (data ? sortProducts(data.data, sortKey) : []), [data, sortKey]);
  const hasSample = products.some((p) => p.isSample);

  function handleIngested(result: IngestResult) {
    // Show the new/updated product: unfiltered list, highlighted.
    setCategory(null);
    setHighlightId(result.product.id);
    refresh();
    window.setTimeout(() => setHighlightId((id) => (id === result.product.id ? null : id)), 6000);
  }

  // Bring the highlighted product into view once it's rendered.
  useEffect(() => {
    if (!highlightId) return;
    const el = [...document.querySelectorAll<HTMLElement>(`[data-product-id="${highlightId}"]`)].find(
      (n) => n.offsetParent !== null,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, data]);

  return (
    <div className="space-y-4">
      {viewer.canIngest ? (
        <IngestForm categories={knownCategories} onIngested={handleIngested} />
      ) : (
        <UpgradeCard signedIn={viewer.signedIn} />
      )}

      {hasSample && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-white/60 px-3 py-1.5 text-xs text-zinc-600 sm:inline-flex sm:items-center sm:rounded-full dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-px size-4 shrink-0 text-zinc-400 sm:mt-0 dark:text-zinc-500">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Includes sample data.</span> &ldquo;Sample&rdquo;
            products use fictional brands and example.com sources; &ldquo;Live&rdquo; ones come from real store pages.
          </span>
        </p>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Filter by category"
          // Phones: one row that scrolls sideways; wider screens: wraps.
          className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {[null, ...knownCategories].map((c) => {
            const active = c === category;
            return (
              <button
                key={c ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition motion-reduce:transition-none ${focusRing} ${
                  active
                    ? "bg-purple-600 text-white shadow-sm shadow-purple-600/30"
                    : "bg-white text-zinc-600 ring-1 ring-zinc-200 ring-inset hover:text-zinc-950 hover:ring-zinc-300 dark:bg-white/[0.03] dark:text-zinc-400 dark:ring-white/10 dark:hover:text-white dark:hover:ring-white/20"
                }`}
              >
                {c ? humanizeSlug(c) : "All categories"}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label="Layout"
            className="hidden rounded-xl bg-zinc-100 p-1 ring-1 ring-zinc-200 ring-inset md:flex dark:bg-white/5 dark:ring-white/10"
          >
            {(["cards", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium text-zinc-500 transition hover:text-zinc-900 aria-pressed:bg-white aria-pressed:text-zinc-950 aria-pressed:shadow-sm motion-reduce:transition-none dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-pressed:bg-zinc-800 dark:aria-pressed:text-white ${focusRing}`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                  {v === "cards" ? (
                    <path d="M3 4.25A1.25 1.25 0 0 1 4.25 3h3.5A1.25 1.25 0 0 1 9 4.25v3.5A1.25 1.25 0 0 1 7.75 9h-3.5A1.25 1.25 0 0 1 3 7.75v-3.5Zm8 0A1.25 1.25 0 0 1 12.25 3h3.5A1.25 1.25 0 0 1 17 4.25v3.5A1.25 1.25 0 0 1 15.75 9h-3.5A1.25 1.25 0 0 1 11 7.75v-3.5Zm-8 8A1.25 1.25 0 0 1 4.25 11h3.5A1.25 1.25 0 0 1 9 12.25v3.5A1.25 1.25 0 0 1 7.75 17h-3.5A1.25 1.25 0 0 1 3 15.75v-3.5Zm8 0A1.25 1.25 0 0 1 12.25 11h3.5A1.25 1.25 0 0 1 17 12.25v3.5A1.25 1.25 0 0 1 15.75 17h-3.5A1.25 1.25 0 0 1 11 15.75v-3.5Z" />
                  ) : (
                    <path
                      fillRule="evenodd"
                      d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5A.75.75 0 0 1 2.75 9h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 9.75Zm0 5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
                      clipRule="evenodd"
                    />
                  )}
                </svg>
                {v === "cards" ? "Cards" : "Table"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="shrink-0">Sort by</span>
            <span className="relative">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className={`h-9 appearance-none rounded-xl border-0 bg-white py-1.5 pr-9 pl-3 text-sm font-medium text-zinc-900 ring-1 ring-zinc-200 ring-inset hover:ring-zinc-300 dark:bg-white/5 dark:text-zinc-100 dark:ring-white/10 dark:hover:ring-white/20 ${focusRing}`}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          </label>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {loading
          ? "Loading products…"
          : error
            ? `Error: ${error}`
            : refreshing
              ? "Updating…"
              : `${products.length} products shown`}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-center dark:border-red-500/30 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-900 dark:text-red-200">Couldn&apos;t load products. {error}</p>
          <button
            type="button"
            onClick={refresh}
            className={`mt-3 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 ${focusRing}`}
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <CardGridSkeleton />
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-white/15">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No products yet.</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Run <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">npm run db:seed</code>{" "}
            to load sample data.
          </p>
        </div>
      ) : (
        <>
          {view === "table" && <ProductTable products={products} highlightId={highlightId} />}
          <ProductGrid className={view === "table" ? "md:hidden" : ""} products={products} highlightId={highlightId} />
        </>
      )}

      {data && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {data.meta.disclaimer} Methodology v{data.meta.methodologyVersion}. &ldquo;conf.&rdquo; = how much evidence
          supports the score.
        </p>
      )}
    </div>
  );
}

// ── Desktop table ────────────────────────────────────────────────────────────

type ListProps = {
  products: ProductDto[];
  highlightId: string | null;
};

const HIGHLIGHT = "bg-purple-50 ring-2 ring-purple-500 ring-inset dark:bg-purple-950/40 dark:ring-purple-400";

function ProductTable({ products, highlightId }: ListProps) {
  return (
    <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 md:block dark:bg-zinc-900 dark:ring-white/10">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <caption className="sr-only">Products ranked with evidence-based scores</caption>
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium tracking-wide text-zinc-600 uppercase dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
            <tr>
              <th scope="col" className="w-10 py-3 pl-4">
                #
              </th>
              <th scope="col" className="px-3 py-3">
                Product
              </th>
              <th scope="col" className="px-3 py-3">
                Overall
              </th>
              {SUB_DIMENSIONS.map((d) => (
                <th key={d} scope="col" className="hidden px-3 py-3 lg:table-cell">
                  {DIMENSION_LABEL[d]}
                </th>
              ))}
              <th scope="col" className="px-3 py-3">
                Best price
              </th>
              <th scope="col" className="py-3 pr-4 text-right">
                <span className="sr-only">Dossier</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-white/10">
            {products.map((p, i) => (
              <tr
                key={p.id}
                data-product-id={p.id}
                className={`transition-colors duration-700 ${p.id === highlightId ? HIGHLIGHT : "hover:bg-zinc-50 dark:hover:bg-white/[0.03]"}`}
              >
                <td className="py-4 pl-4 align-top text-sm tabular-nums text-zinc-500 dark:text-zinc-400">{i + 1}</td>
                <td className="px-3 py-4 align-top">
                  <ProductName product={p} />
                </td>
                <td className="px-3 py-4 align-top">
                  <ScoreCell score={getScore(p, "OVERALL")} emphasis />
                </td>
                {SUB_DIMENSIONS.map((d) => (
                  <td key={d} className="hidden px-3 py-4 align-top lg:table-cell">
                    <ScoreCell score={getScore(p, d)} />
                  </td>
                ))}
                <td className="px-3 py-4 align-top">
                  <BestPrice product={p} />
                </td>
                <td className="py-4 pr-4 text-right align-top">
                  <Link
                    href={dossierHref(p)}
                    className={`group inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950/40 ${focusRing}`}
                  >
                    Dossier
                    <span className="sr-only"> for {p.name}</span>
                    <ArrowIcon className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Card grid (all screen sizes; the table is an extra wide-screen layout) ──

function ProductGrid({ products, highlightId, className = "" }: ListProps & { className?: string }) {
  return (
    <ol className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${className}`}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} href={dossierHref(p)} rank={i + 1} highlighted={p.id === highlightId} frame="bento" />
      ))}
    </ol>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function ProductName({ product: p }: { product: ProductDto }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-zinc-950 dark:text-white">
        <Link
          href={dossierHref(p)}
          className={`rounded-sm hover:text-purple-700 hover:underline hover:underline-offset-2 dark:hover:text-purple-300 ${focusRing}`}
        >
          {p.name}
        </Link>
        {p.isSample ? (
          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-500/20 ring-inset dark:bg-white/10 dark:text-zinc-300 dark:ring-white/15">
            Sample
          </span>
        ) : (
          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20">
            Live
          </span>
        )}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {p.brand && <>{p.brand} · </>}
        {humanizeSlug(p.category)}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {p.evidenceCount} evidence · {p.offers.length} offer{p.offers.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function BestPrice({ product: p }: { product: ProductDto }) {
  if (!p.bestOffer) return <span className="text-sm text-zinc-500 dark:text-zinc-400">No current offer</span>;
  return (
    <div>
      <p className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
        {formatPrice(p.bestOffer.price.amount, p.bestOffer.price.currency)}
      </p>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{p.bestOffer.merchant}</p>
    </div>
  );
}

function ArrowIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
