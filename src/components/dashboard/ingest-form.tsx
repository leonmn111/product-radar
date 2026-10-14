"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { IngestResult } from "@/server/ingest/ingest";
import { DIMENSION_LABEL, formatPrice, humanizeSlug, type Dimension } from "./format";

type State =
  | { kind: "idle" }
  | { kind: "submitting"; url: string }
  | { kind: "success"; result: IngestResult }
  | { kind: "error"; message: string };

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";
const field = `h-11 w-full rounded-xl border-0 text-sm text-zinc-900 placeholder:text-zinc-500 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500 ${focusRing}`;

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
  const urlInput = useRef<HTMLInputElement>(null);

  // "/" jumps to the URL field from anywhere on the page (unless you're already typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      urlInput.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
    <section aria-labelledby={`${ids.url}-title`}>
      <h2 id={`${ids.url}-title`} className="sr-only">
        Analyze a product page
      </h2>
      <form
        onSubmit={submit}
        className="flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-zinc-200 transition focus-within:ring-purple-500/60 motion-reduce:transition-none sm:flex-row sm:items-center dark:bg-zinc-900 dark:ring-white/10 dark:focus-within:ring-purple-500/50"
      >
        <div className="relative min-w-0 flex-1">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-purple-600 dark:text-purple-400"
          >
            <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
          <label htmlFor={ids.url} className="sr-only">
            Product page URL
          </label>
          <input
            ref={urlInput}
            id={ids.url}
            name="url"
            type="url"
            inputMode="url"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste a product page to analyze…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            aria-describedby={ids.hint}
            aria-keyshortcuts="/"
            className={`${field} bg-transparent pr-10 pl-11`}
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-500 ring-1 ring-zinc-200 ring-inset sm:block dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10"
          >
            /
          </kbd>
        </div>
        <div className="flex gap-2">
          <label htmlFor={ids.category} className="sr-only">
            Category (optional)
          </label>
          <input
            id={ids.category}
            name="category"
            list={ids.list}
            autoComplete="off"
            placeholder="Category (optional)"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Lowercase words joined by dashes, e.g. running-shoes"
            value={category}
            onChange={(e) => setCategory(e.target.value.toLowerCase())}
            disabled={busy}
            className={`${field} min-w-0 flex-1 bg-zinc-50 px-3 ring-1 ring-zinc-200 ring-inset sm:w-48 sm:flex-none dark:bg-white/5 dark:ring-white/10`}
          />
          <datalist id={ids.list}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {humanizeSlug(c)}
              </option>
            ))}
          </datalist>
          <button
            type="submit"
            disabled={busy}
            className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-semibold text-white shadow-sm shadow-purple-600/30 transition hover:bg-purple-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none dark:hover:bg-purple-600 dark:hover:shadow-md dark:hover:shadow-purple-500/40 ${focusRing}`}
          >
            {busy && (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 animate-spin" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {busy ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </form>
      <p id={ids.hint} className="mt-2 px-1 text-xs text-zinc-500 dark:text-zinc-400">
        We read the price, stock and rating the store publishes, save them as evidence and score the product. Works best
        with independent stores (e.g. Shopify); some large marketplaces block automated readers.
      </p>

      <div aria-live="polite" className="mt-3 empty:hidden">
        {state.kind === "submitting" && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Fetching the page, extracting product data and recalculating scores…
          </p>
        )}
        {state.kind === "error" && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-600/20 ring-inset dark:bg-red-950/30 dark:text-red-200 dark:ring-red-400/30"
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
    <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-400/30">
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
