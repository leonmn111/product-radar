"use client";

// The user's Dossier library, as a dense terminal-style table (GET /api/user/history via apiClient).
// "Open Dossier" goes to the terminal with that copy, which reopens it free.

import Link from "next/link";
import { useEffect, useState } from "react";
import { getHistory, type LibraryEntry } from "@/lib/apiClient";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";
const muted = "text-zinc-600 dark:text-zinc-400";
const num = "font-mono tabular-nums";
const VERDICT: Record<LibraryEntry["verdict"], string> = {
  LAUNCH: "text-emerald-700 ring-emerald-600/30 bg-emerald-50 dark:text-emerald-300 dark:ring-emerald-400/30 dark:bg-emerald-400/10",
  TEST: "text-amber-800 ring-amber-600/30 bg-amber-50 dark:text-amber-300 dark:ring-amber-400/30 dark:bg-amber-400/10",
  AVOID: "text-red-700 ring-red-600/30 bg-red-50 dark:text-red-300 dark:ring-red-400/30 dark:bg-red-400/10",
  WITHHELD: "text-zinc-700 ring-zinc-400/40 bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-500/40 dark:bg-zinc-800",
};
const utc = (iso: string | null) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "—");

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: LibraryEntry[] };

export function DossierLibrary() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    getHistory({ signal: ac.signal }).then((r) => {
      if (r.ok) setState({ kind: "ready", items: r.data });
      else if (r.error !== "aborted") setState({ kind: "error", message: r.message });
    });
    return () => ac.abort();
  }, []);

  return (
    <section aria-labelledby="library-heading" className="overflow-hidden rounded-md ring-1 ring-zinc-300 dark:ring-zinc-800">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 id="library-heading" className="font-mono text-[11px] font-semibold tracking-widest text-zinc-900 uppercase dark:text-zinc-100">
          <span className="text-purple-700 dark:text-purple-400">DL</span> Dossier library
        </h2>
        {state.kind === "ready" && (
          <span className="rounded-sm bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-zinc-700 uppercase ring-1 ring-zinc-400/40 ring-inset dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-500/40">
            {state.items.length} {state.items.length === 1 ? "dossier" : "dossiers"}
          </span>
        )}
      </header>

      <div aria-live="polite" aria-busy={state.kind === "loading"} className="bg-white dark:bg-zinc-950">
        {state.kind === "loading" && (
          <div aria-hidden="true" className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded-sm bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800" />
            ))}
            <span className="sr-only">Loading your Dossiers…</span>
          </div>
        )}
        {state.kind === "error" && (
          <p role="alert" className="p-3 text-sm text-red-700 dark:text-red-300">
            {state.message}
          </p>
        )}
        {state.kind === "ready" && state.items.length === 0 && (
          <div className="p-6 text-center text-sm">
            <p className="font-medium">No Dossiers yet.</p>
            <p className={`mt-1 ${muted}`}>Every Dossier you buy is kept here, and reopening one is free.</p>
            <Link href="/terminal" className={`mt-3 inline-flex rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700 ${focusRing}`}>
              Run your first Dossier
            </Link>
          </div>
        )}
        {state.kind === "ready" && state.items.length > 0 && (
          <div className="relative overflow-x-auto" /* relative: keeps the absolutely positioned screen-reader labels inside the scroller */>
            <table className="w-full text-[13px]">
              <thead className={`font-mono text-[10px] tracking-wider uppercase ${muted}`}>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th scope="col" className="px-3 py-2 text-left font-medium">ASIN</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Product</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Verdict</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Confidence</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">Generated (UTC)</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {state.items.map((d) => (
                  <tr key={d.dossierId} className="align-middle hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                    <td className={`px-3 py-2 whitespace-nowrap ${num}`}>{d.asin}</td>
                    <td className="max-w-[28rem] px-3 py-2">
                      <span className="line-clamp-1" title={d.title}>
                        {d.title}
                      </span>
                      {d.sample && <span className="font-mono text-[10px] text-amber-700 uppercase dark:text-amber-300">sample data</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase ring-1 ring-inset ${VERDICT[d.verdict]}`}>
                        {d.verdict}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right ${num}`}>{d.confidence === null ? "—" : d.confidence.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${num}`}>{utc(d.generatedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/terminal?asin=${d.asin}&id=${d.dossierId}`}
                        className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-purple-700 ring-1 ring-purple-600/40 ring-inset hover:bg-purple-50 dark:text-purple-300 dark:ring-purple-400/40 dark:hover:bg-purple-400/10 ${focusRing}`}
                      >
                        Open Dossier<span className="sr-only"> for {d.asin} (free)</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
