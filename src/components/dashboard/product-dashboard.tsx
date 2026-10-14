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
        <div
          role="note"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <strong className="font-semibold">Includes sample data.</strong> Products marked &ldquo;Sample&rdquo; use
          fictional brands and example.com sources for demonstration. Products marked &ldquo;Live&rdquo; come from real
          store pages.
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          {[null, ...knownCategories].map((c) => {
            const active = c === category;
            return (
              <button
                key={c ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-white text-zinc-700 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                {c ? humanizeSlug(c) : "All categories"}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
        <div role="group" aria-label="Layout" className="hidden rounded-lg bg-zinc-100 p-0.5 md:flex dark:bg-zinc-800">
          {(["cards", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium text-zinc-600 hover:text-zinc-900 aria-pressed:bg-white aria-pressed:text-zinc-950 aria-pressed:shadow-sm dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-pressed:bg-zinc-950 dark:aria-pressed:text-white ${focusRing}`}
            >
              {v === "cards" ? "Cards" : "Table"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="shrink-0">Sort by</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className={`rounded-md border-0 bg-white py-1.5 pr-8 pl-3 text-sm text-zinc-900 ring-1 ring-zinc-300 ring-inset dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 ${focusRing}`}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
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
        <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-center dark:border-red-500/30 dark:bg-red-950/30">
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
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
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
    <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <caption className="sr-only">Products ranked with evidence-based scores</caption>
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium tracking-wide text-zinc-600 uppercase dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
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
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {products.map((p, i) => (
              <tr
                key={p.id}
                data-product-id={p.id}
                className={`transition-colors duration-700 ${p.id === highlightId ? HIGHLIGHT : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"}`}
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
        <ProductCard key={p.id} product={p} href={dossierHref(p)} rank={i + 1} highlighted={p.id === highlightId} />
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
          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20">
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
