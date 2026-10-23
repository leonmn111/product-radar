import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { LiveResults } from "@/components/live/live-results";
import { env } from "@/lib/env";
import { getViewer } from "@/server/auth/entitlements";
import { liveSources } from "@/server/live/config";
import { runLiveSearch } from "@/server/live/search";
import { MARKETS, type Market } from "@/server/live/types";
import { LATEST_FX } from "@/server/scoring/fx-latest";
import { SAMPLE_QUERY } from "@/server/sources/sample";

export const metadata: Metadata = {
  title: "Live search — ProductRadar",
  description: "Search Amazon US and UK and AliExpress live, with cited evidence and a 0.7 confidence minimum.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";

function readParams(params: Record<string, string | string[] | undefined>) {
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const asked = [params.m].flat().filter((m): m is string => typeof m === "string").map((m) => m.toUpperCase());
  const markets = (Object.keys(MARKETS) as Market[]).filter((m) => asked.includes(m));
  return { q, markets: markets.length ? markets : (Object.keys(MARKETS) as Market[]) };
}

function SearchForm({ q, markets }: { q: string; markets: Market[] }) {
  return (
    <form action="/search" method="get" className="flex flex-col gap-3 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-zinc-200 sm:flex-row sm:items-center dark:bg-zinc-900 dark:ring-white/10">
      <label htmlFor="live-q" className="sr-only">
        What to search for
      </label>
      <input
        id="live-q"
        name="q"
        type="search"
        required
        minLength={2}
        maxLength={120}
        defaultValue={q}
        placeholder={`Search a product, e.g. ${SAMPLE_QUERY}`}
        className={`h-11 min-w-0 flex-1 rounded-xl border-0 bg-transparent px-4 text-sm text-zinc-900 placeholder:text-zinc-500 dark:text-zinc-100 ${focusRing}`}
      />
      <fieldset className="flex items-center gap-3 px-2 sm:px-0">
        <legend className="sr-only">Markets</legend>
        {(Object.keys(MARKETS) as Market[]).map((m) => (
          <label key={m} className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" name="m" value={m} defaultChecked={markets.includes(m)} className="size-4 accent-purple-600" />
            {m === "GB" ? "UK" : m}
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        className={`h-11 shrink-0 rounded-xl bg-purple-600 px-5 text-sm font-semibold text-white shadow-sm shadow-purple-600/30 transition hover:bg-purple-700 active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
      >
        Search live
      </button>
    </form>
  );
}

async function Results({ q, markets }: { q: string; markets: Market[] }) {
  const live = liveSources({ allowSample: true });
  if (!live.ready) return null;
  const result = await runLiveSearch(q, markets, { ...live.sources, fx: LATEST_FX });
  return <LiveResults result={result} />;
}

async function LiveSearch({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  if (!viewer) redirect("/signin?callbackUrl=%2Fsearch");
  const { q, markets } = readParams(params);
  const live = liveSources({ allowSample: true });
  // Real provider calls from the site wait for metered credits (ROADMAP Phase 13), so the
  // $50/month budget can't be run down by unpaid searches. Sample mode and local testing run.
  const canRun = live.ready && (live.sample || env.NODE_ENV !== "production");

  if (!canRun) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-white/10">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Live search is coming</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          We&apos;re connecting live sources (Amazon US and UK, and AliExpress suppliers). Searches open here with credit packs; AI
          agents will be able to use the paid API at /api/agent/v2/search as soon as both sources are connected.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {live.sample && (
        <p className="rounded-xl bg-purple-50 px-4 py-3 text-sm text-purple-950 ring-1 ring-purple-600/20 ring-inset dark:bg-purple-500/10 dark:text-purple-100 dark:ring-purple-400/20">
          <strong className="font-semibold">Sample data (development).</strong> Amazon results are a real recorded Amazon UK search
          from 15 October 2026; AliExpress offers are made-up samples. Try &ldquo;
          {SAMPLE_QUERY}&rdquo;.
        </p>
      )}
      <SearchForm q={q} markets={markets} />
      {q.length >= 2 && (
        <Suspense
          key={`${q}|${markets.join(",")}`}
          fallback={
            <div aria-hidden="true" className="space-y-4">
              <div className="h-5 w-64 animate-pulse rounded bg-zinc-200/70 dark:bg-white/5" />
              <div className="h-80 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
            </div>
          }
        >
          <Results q={q} markets={markets} />
        </Suspense>
      )}
    </div>
  );
}

export default function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">Live search</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Amazon US and UK against AliExpress suppliers, searched live. Only results with at least 0.7 confidence on both sides
            are shown, and every number links to its source.
          </p>
        </div>
        <Suspense fallback={<div aria-hidden="true" className="h-14 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />}>
          <LiveSearch searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
