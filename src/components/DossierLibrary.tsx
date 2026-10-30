"use client";

// The user's Dossier library, as a dense terminal-style table (GET /api/user/history via apiClient).
// "Open Dossier" goes to the terminal with that copy, which reopens it free.

import Link from "next/link";
import { useEffect, useState } from "react";
import { getHistory, type LibraryEntry } from "@/lib/apiClient";
import { VerdictPill } from "./verdict-pill";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const muted = "text-slate-600 dark:text-slate-400";
const num = "font-mono tabular-nums";
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
    <section aria-labelledby="library-heading" className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line-dark dark:bg-surface-dark">
      <header className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-line-dark dark:bg-background-dark">
        <h2 id="library-heading" className="font-mono text-[11px] font-semibold tracking-widest text-slate-900 uppercase dark:text-slate-100">
          <span className="text-accent-mint">DL</span> Dossier library
        </h2>
        {state.kind === "ready" && (
          <span className="rounded-sm bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-slate-700 uppercase ring-1 ring-slate-400/40 ring-inset dark:bg-surface-raised dark:text-slate-300 dark:ring-slate-500/40">
            {state.items.length} {state.items.length === 1 ? "dossier" : "dossiers"}
          </span>
        )}
      </header>

      <div aria-live="polite" aria-busy={state.kind === "loading"} className="bg-white dark:bg-background-dark">
        {state.kind === "loading" && (
          <div aria-hidden="true" className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded-sm bg-slate-200 motion-reduce:animate-none dark:bg-surface-raised" />
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
            <Link href="/terminal" className={`mt-3 inline-flex rounded-md bg-accent-mint px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-mint-strong ${focusRing}`}>
              Run your first Dossier
            </Link>
          </div>
        )}
        {state.kind === "ready" && state.items.length > 0 && (
          <div className="relative overflow-x-auto" /* relative: keeps the absolutely positioned screen-reader labels inside the scroller */>
            <table className="w-full text-[13px]">
              <thead className={`font-mono text-[10px] tracking-wider uppercase ${muted}`}>
                <tr className="border-b border-gray-200 dark:border-line-dark">
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
              <tbody className="divide-y divide-gray-100 dark:divide-line-dark">
                {state.items.map((d) => (
                  <tr key={d.dossierId} className="align-middle hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                    <td className={`px-3 py-2 whitespace-nowrap ${num}`}>{d.asin}</td>
                    <td className="max-w-[28rem] px-3 py-2">
                      <span className="line-clamp-1" title={d.title}>
                        {d.title}
                      </span>
                      {d.sample && <span className="font-mono text-[10px] text-amber-700 uppercase dark:text-amber-300">sample data</span>}
                    </td>
                    <td className="px-3 py-2">
                      <VerdictPill tier={d.verdict} size="sm" />
                    </td>
                    <td className={`px-3 py-2 text-right ${num}`}>{d.confidence === null ? "—" : d.confidence.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${num}`}>{utc(d.generatedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/terminal?asin=${d.asin}&id=${d.dossierId}`}
                        className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-accent-mint ring-1 ring-accent-mint/40 ring-inset hover:bg-accent-mint/15 ${focusRing}`}
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
