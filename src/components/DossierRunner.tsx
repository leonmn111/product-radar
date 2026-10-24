"use client";

// Runs a Standard Dossier for one Amazon UK ASIN, paid in credits (POST /api/dossier/{asin}), and
// shows it in the DossierTerminal. Without enough credits it doesn't call anything: it opens the
// credit packs instead. If the server finds the balance too low (it changed meanwhile), the same.

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { CreditPacksModal } from "@/components/CreditPacksModal";
import { DossierTerminal } from "@/components/DossierTerminal";
import { getDossier } from "@/lib/apiClient";
import type { Dossier } from "@/types/dossier";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";

type State =
  | { kind: "idle" }
  | { kind: "running"; asin: string }
  | { kind: "error"; message: string }
  | { kind: "done"; dossier: Dossier; charged: number; cache: string | null };

export function DossierRunner({
  balance,
  cost,
  onSale,
  unavailable,
  example,
  initialAsin = "",
  reopened,
}: {
  balance: number;
  /** Credits a Standard Dossier costs this user (4, or 1 on Pro / Agency). */
  cost: number;
  onSale: boolean;
  /** Set when live Dossiers can't run yet: why. */
  unavailable?: string;
  /** An ASIN that has data, in development sample mode. */
  example?: string;
  /** Pre-filled ASIN (e.g. from /terminal?asin=…). */
  initialAsin?: string;
  /** A Dossier the user already owns, reopened from their library: shown at once, free. */
  reopened?: Dossier | null;
}) {
  const router = useRouter();
  const inputId = useId();
  const [asin, setAsin] = useState(reopened?.product.identifiers.asin ?? initialAsin);
  const [state, setState] = useState<State>(reopened ? { kind: "done", dossier: reopened, charged: 0, cache: "reopened" } : { kind: "idle" });
  const [packs, setPacks] = useState<{ open: boolean; reason?: string }>({ open: false });
  const short = (have: number) => `A Standard Dossier costs ${cost} credit${cost === 1 ? "" : "s"}; you have ${have}.`;

  async function run(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = asin.trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(id)) {
      setState({ kind: "error", message: "An Amazon UK ASIN is 10 letters and numbers, e.g. B0CH33F5P2." });
      return;
    }
    if (balance < cost) {
      setPacks({ open: true, reason: short(balance) }); // intercepted: nothing is called or charged
      return;
    }
    setState({ kind: "running", asin: id });
    const result = await getDossier(id);
    if (!result.ok && result.error === "insufficient_credits") {
      setState({ kind: "idle" });
      setPacks({ open: true, reason: short(typeof result.details.balance === "number" ? result.details.balance : 0) });
      router.refresh();
      return;
    }
    if (!result.ok) {
      setState({ kind: "error", message: result.message });
      if (result.status !== 0) router.refresh(); // a refund may have changed the balance
      return;
    }
    setState({ kind: "done", dossier: result.data.dossier, charged: result.data.creditsCharged, cache: result.data.cache });
    router.refresh(); // the header shows the new balance
  }

  const running = state.kind === "running";
  return (
    <div className="space-y-5">
      <form onSubmit={run} className="flex flex-col gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-300 sm:flex-row sm:items-end dark:bg-surface-dark dark:ring-line-dark">
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="font-mono text-[11px] font-semibold tracking-widest text-slate-600 uppercase dark:text-slate-400">
            Amazon UK ASIN
          </label>
          <input
            id={inputId}
            value={asin}
            onChange={(e) => setAsin(e.target.value)}
            placeholder={example ? `e.g. ${example}` : "e.g. B0CH33F5P2"}
            autoComplete="off"
            spellCheck={false}
            maxLength={10}
            disabled={running || Boolean(unavailable)}
            className={`mt-1 h-11 w-full rounded-md bg-slate-50 px-3 font-mono text-base tracking-wider text-slate-950 uppercase ring-1 ring-slate-300 placeholder:text-slate-400 placeholder:normal-case disabled:opacity-60 dark:bg-background-dark dark:text-white dark:ring-line-dark ${focusRing}`}
          />
        </div>
        <button
          type="submit"
          disabled={running || Boolean(unavailable)}
          aria-busy={running}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent-mint px-5 text-sm font-semibold whitespace-nowrap text-background-dark shadow-sm hover:bg-accent-mint-strong disabled:cursor-not-allowed disabled:bg-accent-mint/50 ${focusRing}`}
        >
          {running && <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />}
          {running ? "Building Dossier…" : `Run Dossier · ${cost} credit${cost === 1 ? "" : "s"}`}
        </button>
      </form>

      <div aria-live="polite" className="text-sm">
        {unavailable && <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">{unavailable}</p>}
        {state.kind === "error" && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-800 dark:bg-red-400/10 dark:text-red-200">
            {state.message}
          </p>
        )}
        {state.kind === "running" && <p className="text-slate-600 dark:text-slate-400">Reading Amazon UK and suppliers for {state.asin}. This can take up to a minute.</p>}
        {state.kind === "done" && state.cache === "reopened" && (
          <p className="text-slate-600 dark:text-slate-400">
            Reopened from your library: the copy you bought on {state.dossier.generatedAt.slice(0, 10)}. No credits used. Run it again for fresh data.
          </p>
        )}
        {state.kind === "done" && state.cache !== "reopened" && (
          <p className="text-slate-600 dark:text-slate-400">
            {state.charged} credit{state.charged === 1 ? "" : "s"} used{state.cache === "hit" ? " (from a copy built in the last 48 hours)" : ""}. You have {balance} left.
          </p>
        )}
      </div>

      {state.kind === "done" && <DossierTerminal dossier={state.dossier} />}

      <CreditPacksModal open={packs.open} onClose={() => setPacks({ open: false })} onSale={onSale} balance={balance} reason={packs.reason} />
    </div>
  );
}
