"use client";

import { useId, useState } from "react";
import type { IngestResult } from "@/server/ingest/ingest";
import { DIMENSION_LABEL, formatPrice, humanizeSlug, type Dimension } from "./format";

type State =
  | { kind: "idle" }
  | { kind: "submitting"; url: string }
  | { kind: "success"; result: IngestResult }
  | { kind: "error"; message: string };

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400";
const input = `w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-300 ring-inset placeholder:text-zinc-500 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700 dark:placeholder:text-zinc-500 ${focusRing}`;

export function IngestForm({
  categories,
  onIngested,
}: {
  categories: string[];
  onIngested: (result: IngestResult) => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const ids = { url: useId(), category: useId(), list: useId(), hint: useId() };
  const busy = state.kind === "submitting";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setState({ kind: "submitting", url });
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, category: category.trim() || undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState({ kind: "error", message: body?.message ?? `Request failed (HTTP ${res.status}).` });
        return;
      }
      setState({ kind: "success", result: body as IngestResult });
      setUrl("");
      onIngested(body as IngestResult);
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server. Is it running?" });
    }
  }

  return (
    <section
      aria-labelledby={`${ids.url}-title`}
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id={`${ids.url}-title`} className="text-base font-semibold text-zinc-950 dark:text-white">
        New opportunity URL
      </h2>
      <p id={ids.hint} className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Paste a product page. We read the price, stock and rating the store publishes, save them as evidence, and score
        the product. Works best with independent stores (e.g. Shopify); some large marketplaces block automated readers.
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor={ids.url} className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Product URL
          </label>
          <input
            id={ids.url}
            name="url"
            type="url"
            inputMode="url"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="https://store.com/products/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            aria-describedby={ids.hint}
            className={`mt-1 ${input}`}
          />
        </div>
        <div className="lg:w-56">
          <label htmlFor={ids.category} className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Category <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
          </label>
          <input
            id={ids.category}
            name="category"
            list={ids.list}
            autoComplete="off"
            placeholder="e.g. running-shoes"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Lowercase words joined by dashes, e.g. running-shoes"
            value={category}
            onChange={(e) => setCategory(e.target.value.toLowerCase())}
            disabled={busy}
            className={`mt-1 ${input}`}
          />
          <datalist id={ids.list}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {humanizeSlug(c)}
              </option>
            ))}
          </datalist>
        </div>
        <button
          type="submit"
          disabled={busy}
          className={`inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:text-zinc-950 ${focusRing}`}
        >
          {busy && (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 animate-spin" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {busy ? "Analyzing…" : "Analyze & add"}
        </button>
      </form>

      <div aria-live="polite" className="mt-3 empty:hidden">
        {state.kind === "submitting" && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Fetching the page, extracting product data and recalculating scores…
          </p>
        )}
        {state.kind === "error" && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-600/20 ring-inset dark:bg-red-950/30 dark:text-red-200 dark:ring-red-400/30"
          >
            {state.message}
          </p>
        )}
        {state.kind === "success" && <Summary result={state.result} />}
      </div>
    </section>
  );
}

function Summary({ result: r }: { result: IngestResult }) {
  const facts = [
    r.extracted.price && `price ${formatPrice(r.extracted.price.amount, r.extracted.price.currency)}`,
    r.extracted.rating && `rating ${r.extracted.rating.value}/${r.extracted.rating.best}`,
    r.extracted.reviewCount !== null && `${r.extracted.reviewCount.toLocaleString("en-US")} ratings`,
  ].filter(Boolean);
  const overall = r.scores.find((s) => s.dimension === "OVERALL");
  return (
    <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-400/30">
      <p>
        <strong className="font-semibold">{r.status === "created" ? "Added" : "Updated"}:</strong> {r.product.name} in{" "}
        {humanizeSlug(r.product.category)}. Saved {r.evidenceCreated} evidence item{r.evidenceCreated === 1 ? "" : "s"}
        {facts.length ? ` (${facts.join(", ")})` : ""}.{" "}
        {overall
          ? `Overall score ${overall.value.toFixed(1)} from ${r.scores.length - 1} dimension${r.scores.length === 2 ? "" : "s"}${r.scores.length > 1 ? ` (${r.scores.filter((s) => s.dimension !== "OVERALL").map((s) => DIMENSION_LABEL[s.dimension as Dimension]).join(", ")})` : ""}.`
          : "Not enough evidence to score it yet."}
      </p>
      {r.warnings.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-amber-900 dark:text-amber-200">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
