"use client";

// The hero's paste box: an Amazon UK link (or ASIN) in, a free verdict out, with no account and no card.
// The link is read in the browser first (parseAmazonUkLink is pure), so a wrong paste never costs a request.
// The check itself runs live (POST /api/free-verdict), which can take 10–20 seconds; the full Dossier
// is one free sign-up away, with the product already filled in.

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { parseAmazonUkLink } from "@/server/live/amazonLink";
import type { FreeVerdict } from "@/types/freeVerdict";
import { RISK_BADGE, RISK_SHORT_NOTE } from "../dashboard/resellability";
import { VerdictPill } from "../verdict-pill";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "error"; message: string; signUp?: string }
  | { kind: "done"; result: FreeVerdict };

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";

function Result({ result: r }: { result: FreeVerdict }) {
  const v = r.verdict;
  return (
    <div className="mt-5 rounded-2xl border border-white/[0.08] bg-surface-dark/80 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur">
      <p className="font-mono text-[11px] tracking-widest text-slate-400 uppercase">
        Free verdict · Amazon UK {r.asin}
        {r.fromCache && " · from the last 48 hours"}
      </p>
      <p className="mt-2 line-clamp-2 font-semibold text-white">{r.title}</p>
      {v.status === "shown" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <VerdictPill tier={v.kind} gate={v.gate} />
          {r.risk === "compliance" && <span className="text-sm font-semibold text-white">{RISK_BADGE.compliance}</span>}
          <span className="text-sm text-slate-300">
            Confidence <span className="font-semibold text-white tabular-nums">{v.confidence.toFixed(2)}</span>
          </span>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-slate-300">
            <VerdictPill tier="WITHHELD" className="mr-2 align-middle" /> the evidence is too thin (confidence {v.confidence.toFixed(2)}, a verdict needs 0.5). Missing:
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-400">
            {v.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {r.risk && <p className="mt-3 text-sm font-semibold text-white">{RISK_SHORT_NOTE[r.risk]}</p>}
      <p className="mt-3 text-xs text-slate-400">
        Built from {r.evidenceCount} cited source{r.evidenceCount === 1 ? "" : "s"} and {r.supplierMatches} supplier match{r.supplierMatches === 1 ? "" : "es"}. The full Dossier shows the landed margin, every
        cost line and the suppliers, and your first one is free with a new account.
      </p>
      <Link
        href={r.fullDossier}
        className={`group mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-background-dark transition hover:bg-slate-200 active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
      >
        Open the full Dossier free
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
          →
        </span>
      </Link>
    </div>
  );
}

export function PasteBox() {
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const checking = state.kind === "checking";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const link = input.current?.value ?? "";
    const parsed = parseAmazonUkLink(link);
    if (!parsed.ok) {
      setState({ kind: "error", message: parsed.message });
      input.current?.focus();
      return;
    }
    setState({ kind: "checking" });
    try {
      const res = await fetch("/api/free-verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ link }),
        signal: AbortSignal.timeout(90_000),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body) setState({ kind: "done", result: body as FreeVerdict });
      else setState({ kind: "error", message: body?.message ?? "That check didn't work. Please try again.", signUp: body?.signUp });
    } catch {
      setState({ kind: "error", message: "That took too long or the connection dropped. Your free check wasn't used; please try again." });
    }
  }

  const describedBy = `${ids}-hint${state.kind === "error" ? ` ${ids}-error` : ""}`;
  return (
    <div id="check" className="scroll-mt-24">
      <form onSubmit={onSubmit} noValidate className="mt-9">
        <label htmlFor={`${ids}-link`} className="sr-only">
          Amazon UK product link or ASIN
        </label>
        <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/10 transition focus-within:ring-2 focus-within:ring-accent-mint/70 sm:flex-row sm:items-center">
          <input
            ref={input}
            id={`${ids}-link`}
            name="link"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Paste an Amazon UK link or ASIN…"
            aria-describedby={describedBy}
            aria-invalid={state.kind === "error" || undefined}
            disabled={checking}
            className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-base text-white placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={checking}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent-mint px-5 py-3 text-base font-semibold whitespace-nowrap text-on-accent shadow-lg shadow-accent-mint/20 transition duration-200 hover:bg-accent-mint-strong active:scale-[0.98] disabled:cursor-wait disabled:opacity-80 motion-reduce:transition-none ${focusRing}`}
          >
            {checking ? (
              <>
                <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-background-dark/30 border-t-background-dark motion-reduce:animate-none" />
                Checking…
              </>
            ) : (
              "Check it free →"
            )}
          </button>
        </div>
        <p id={`${ids}-hint`} className="mt-3 text-sm text-slate-400">
          No card. Your first verdict needs no account, and your first Dossier is free. Includes TikTok Shop UK&apos;s 9% commission and
          £0.50 self-ship fee, the 15% creator cut and UK VAT.
        </p>
      </form>
      <div aria-live="polite">
        {checking && (
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-300">
            <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-accent-mint motion-reduce:animate-none" />
            Checking Amazon UK and AliExpress live. This takes about 10–20 seconds.
          </p>
        )}
        {state.kind === "error" && (
          <p id={`${ids}-error`} className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {state.message}
            {state.signUp && (
              <>
                {" "}
                <Link href={state.signUp} className={`font-semibold text-white underline underline-offset-2 ${focusRing}`}>
                  Create a free account
                </Link>
              </>
            )}
          </p>
        )}
        {state.kind === "done" && <Result result={state.result} />}
      </div>
    </div>
  );
}
