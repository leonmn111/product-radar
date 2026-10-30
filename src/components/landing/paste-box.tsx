"use client";

// The hero's check: a TikTok Shop, Amazon UK or AliExpress product link and the visitor's supplier price in,
// a quick verdict out (the verdict pill and what they'd keep per sale), with no account and no card. The
// link is read in the browser first (parseProductLink is pure), so a wrong paste never costs a request.
// The check runs live (POST /api/free-verdict) and can take up to a minute for a TikTok Shop or AliExpress
// link (the product is found on Amazon UK first). Below the verdict, a blurred preview and an email gate:
// the email unlocks the full breakdown (POST /api/free-verdict/unlock), free for the first 3 products.

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { parseProductLink } from "@/server/live/productLink";
import type { QuickBreakdown, QuickCheck } from "@/types/quickCheck";
import { VerdictPill } from "../verdict-pill";

type State =
  | { kind: "idle" }
  | { kind: "checking"; slow: boolean }
  | { kind: "error"; message: string; signUp?: string }
  | { kind: "done"; result: QuickCheck };

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const field =
  "min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-base text-white placeholder:text-slate-400 focus:outline-none disabled:opacity-60";
const gbp = (x: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Math.abs(x));
const linkButton = `group inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-background-dark transition hover:bg-slate-200 active:scale-[0.98] motion-reduce:transition-none ${focusRing}`;

const SUPPLIER_FROM: Record<NonNullable<QuickCheck["supplierPrice"]>["source"], string> = {
  you: "your",
  aliexpress_link: "the AliExpress listing's",
  aliexpress_matches: "matched AliExpress listings'",
};

// ── Quick verdict ────────────────────────────────────────────────────────────

function QuickVerdict({ result: r }: { result: QuickCheck }) {
  const keep = r.keepPerSale;
  return (
    <div className="mt-5 rounded-2xl border border-white/[0.08] bg-surface-dark/80 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur">
      <p className="font-mono text-[11px] tracking-widest text-slate-400 uppercase">
        Quick verdict{r.fromCache && " · from the last 48 hours"}
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-slate-300">
        {r.pastedName ? (
          <>
            Matched on Amazon UK: <span className="font-semibold text-white">{r.product.title}</span>
          </>
        ) : (
          <span className="font-semibold text-white">{r.product.title}</span>
        )}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <VerdictPill tier={r.verdict.tier} gate={r.verdict.gate} />
        {keep !== null && (
          <p className="text-2xl font-bold tracking-tight text-white tabular-nums">
            You {keep >= 0 ? "keep" : "lose"} {gbp(keep)} per sale
          </p>
        )}
      </div>
      {keep !== null && r.sellingPrice !== null && r.supplierPrice && (
        <p className="mt-2 text-xs text-slate-400">
          Before ad spend, selling at {gbp(r.sellingPrice)} (its Amazon UK price) with {SUPPLIER_FROM[r.supplierPrice.source]} {gbp(r.supplierPrice.amount)}{" "}
          supplier price, after UK VAT, TikTok Shop UK fees and the creator cut.
        </p>
      )}
      {r.reason && <p className="mt-3 text-sm text-slate-200">{r.reason}</p>}
      {r.missing.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-400">
          {r.missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {r.unlockToken ? (
        <EmailGate token={r.unlockToken} fullDossier={r.fullDossier} />
      ) : (
        <Link href={r.fullDossier} className={`mt-4 ${linkButton}`}>
          Open the full Dossier free
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
            →
          </span>
        </Link>
      )}
    </div>
  );
}

// ── Email gate ───────────────────────────────────────────────────────────────

/** What the blurred preview stands in for: shapes only, no figures (nothing is shown before it's unlocked). */
function BlurredPreview() {
  const rows = ["w-40", "w-32", "w-44", "w-36", "w-28", "w-48", "w-32", "w-40", "w-36"];
  return (
    <div aria-hidden="true" className="pointer-events-none space-y-3 p-5 blur-[3px] select-none">
      {rows.map((w, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className={`h-3 ${w} max-w-[60%] rounded bg-white/15`} />
          <div className="h-3 w-16 rounded bg-white/20" />
        </div>
      ))}
    </div>
  );
}

type GateState = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string; signUp?: string } | { kind: "done"; breakdown: QuickBreakdown };

function EmailGate({ token, fullDossier }: { token: string; fullDossier: string }) {
  const ids = useId();
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [state, setState] = useState<GateState>({ kind: "idle" });

  async function unlock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/free-verdict/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, email, marketing }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body) setState({ kind: "done", breakdown: body as QuickBreakdown });
      else setState({ kind: "error", message: body?.message ?? "That didn't work. Please try again.", signUp: body?.signUp });
    } catch {
      setState({ kind: "error", message: "The connection dropped. Please try again." });
    }
  }

  if (state.kind === "done") return <Breakdown b={state.breakdown} fullDossier={fullDossier} />;
  const sending = state.kind === "sending";
  return (
    <div className="relative mt-5 overflow-hidden rounded-xl border border-white/[0.08] bg-background-dark/60">
      <BlurredPreview />
      <form onSubmit={unlock} noValidate className="absolute inset-0 flex flex-col justify-center gap-3 overflow-y-auto bg-background-dark/75 p-4 sm:p-5">
        <p id={`${ids}-pitch`} className="text-sm font-semibold text-balance text-white">
          Get the full breakdown, worst-case scenario, and ad-test plan — free for your first 3.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`${ids}-email`} className="sr-only">
            Your email
          </label>
          <input
            id={`${ids}-email`}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourshop.co.uk"
            aria-describedby={`${ids}-pitch ${ids}-privacy${state.kind === "error" ? ` ${ids}-error` : ""}`}
            aria-invalid={state.kind === "error" || undefined}
            disabled={sending}
            className="min-w-0 flex-1 rounded-lg bg-white/[0.06] px-3 py-2.5 text-base text-white ring-1 ring-white/15 placeholder:text-slate-400 focus:ring-2 focus:ring-accent-mint/70 focus:outline-none sm:text-sm"
          />
          <button
            type="submit"
            disabled={sending}
            className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-accent-mint px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-on-accent transition hover:bg-accent-mint-strong disabled:cursor-wait disabled:opacity-80 ${focusRing}`}
          >
            {sending ? "Unlocking…" : "Unlock Full Dossier"}
          </button>
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent-mint" />
          Also email me ProductRadar tips and offers (optional; unsubscribe any time).
        </label>
        <p id={`${ids}-privacy`} className="text-[11px] text-slate-400">
          We use your email to unlock your breakdowns. See our{" "}
          <Link href="/privacy" className={`underline underline-offset-2 hover:text-white ${focusRing}`}>
            Privacy Policy
          </Link>
          .
        </p>
        {state.kind === "error" && (
          <p id={`${ids}-error`} role="alert" className="text-xs text-rose-200">
            {state.message}{" "}
            {state.signUp && (
              <Link href={state.signUp} className={`font-semibold text-white underline underline-offset-2 ${focusRing}`}>
                Create a free account
              </Link>
            )}
          </p>
        )}
      </form>
    </div>
  );
}

// ── The unlocked breakdown ───────────────────────────────────────────────────

function Breakdown({ b, fullDossier }: { b: QuickBreakdown; fullDossier: string }) {
  const row = "flex items-baseline justify-between gap-4 py-1.5";
  const sourceLink = `underline underline-offset-2 hover:text-white ${focusRing}`;
  return (
    <div className="mt-5 space-y-5 border-t border-white/[0.08] pt-5 text-sm text-slate-300">
      <section aria-labelledby="bd-costs">
        <h3 id="bd-costs" className="font-mono text-[11px] tracking-widest text-slate-400 uppercase">
          Full breakdown · per sale
        </h3>
        <dl className="mt-2 divide-y divide-white/[0.06]">
          <div className={row}>
            <dt className="min-w-0">
              Selling price <span className="text-xs text-slate-400">(median of {b.sellingPrice.listings} Amazon UK listings)</span>
            </dt>
            <dd className="shrink-0 font-semibold text-white tabular-nums">{gbp(b.sellingPrice.amount)}</dd>
          </div>
          {b.lines.map((l) => (
            <div key={l.label} className={row}>
              <dt className="min-w-0">
                {l.label}
                {l.basis === "estimate" && <span className="ml-1.5 text-xs text-amber-300">estimate</span>}
              </dt>
              <dd className="shrink-0 tabular-nums">−{gbp(l.amount)}</dd>
            </div>
          ))}
          <div className={`${row} font-semibold text-white`}>
            <dt>{b.keepPerSale >= 0 ? "You keep" : "You lose"}, before ads</dt>
            <dd className={`shrink-0 tabular-nums ${b.keepPerSale >= 0 ? "text-accent-mint" : "text-rose-300"}`}>{gbp(b.keepPerSale)}</dd>
          </div>
        </dl>
        {b.notCounted.length > 0 && <p className="mt-2 text-xs text-amber-200">Not counted (couldn&apos;t be sourced): {b.notCounted.join(", ")}.</p>}
        <p className="mt-2 text-xs text-slate-400">It breaks even before ads at a supplier price up to {gbp(b.breakEvenSupplierPrice)}.</p>
      </section>

      <section aria-labelledby="bd-ads">
        <h3 id="bd-ads" className="font-semibold text-white">
          Ad cost
        </h3>
        <p className="mt-1">
          {b.breakEvenAdCost > 0
            ? `Each sale can spend up to ${gbp(b.breakEvenAdCost)} on ads before it loses money: your break-even ad cost.`
            : "Nothing: it loses money before any ads."}
        </p>
      </section>

      <section aria-labelledby="bd-worst">
        <h3 id="bd-worst" className="font-semibold text-white">
          Worst case
        </h3>
        <p className="mt-1">
          If none of a {b.worstCase.testUnits}-unit test sells, you lose the {gbp(b.worstCase.stock)} of stock
          {b.worstCase.adBudget > 0 && <> plus up to {gbp(b.worstCase.adBudget)} of ads (the plan&apos;s cap)</>}:{" "}
          <span className="font-semibold text-white">at most {gbp(b.worstCase.total)}</span>.
        </p>
      </section>

      <section aria-labelledby="bd-plan">
        <h3 id="bd-plan" className="font-semibold text-white">
          Ad-test plan
        </h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          {b.adTestPlan.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      <details className="text-xs text-slate-400">
        <summary className={`cursor-pointer font-semibold text-slate-300 ${focusRing}`}>Sources</summary>
        <ul className="mt-2 space-y-1.5">
          {b.sellingPrice.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className={sourceLink}>
                {s.claim}
              </a>
            </li>
          ))}
          {b.supplierSource && (
            <li>
              <a href={b.supplierSource.url} target="_blank" rel="noopener noreferrer" className={sourceLink}>
                {b.supplierSource.claim}
              </a>
            </li>
          )}
          {b.rules.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className={sourceLink}>
                {r.label}
              </a>
            </li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={fullDossier} className={linkButton}>
          Open the full Dossier free
          <span aria-hidden="true">→</span>
        </Link>
        <p className="text-xs text-slate-400">
          {b.freeLeft} free breakdown{b.freeLeft === 1 ? "" : "s"} left · a calculated estimate, not a guarantee
        </p>
      </div>
    </div>
  );
}

// ── The check ────────────────────────────────────────────────────────────────

export function PasteBox() {
  const ids = useId();
  const linkInput = useRef<HTMLInputElement>(null);
  const priceInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const checking = state.kind === "checking";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const link = linkInput.current?.value ?? "";
    const supplierPrice = priceInput.current?.value ?? "";
    const parsed = parseProductLink(link);
    if (!parsed.ok) {
      setState({ kind: "error", message: parsed.message });
      linkInput.current?.focus();
      return;
    }
    if (supplierPrice.trim() && !/^£?\s*\d{1,5}(\.\d{1,2})?$/.test(supplierPrice.trim())) {
      setState({ kind: "error", message: "Enter your supplier price per unit in pounds, like 4.50." });
      priceInput.current?.focus();
      return;
    }
    setState({ kind: "checking", slow: parsed.kind !== "amazon" });
    try {
      const res = await fetch("/api/free-verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ link, supplierPrice }),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body) setState({ kind: "done", result: body as QuickCheck });
      else setState({ kind: "error", message: body?.message ?? "That check didn't work. Please try again.", signUp: body?.signUp });
    } catch {
      setState({ kind: "error", message: "That took too long or the connection dropped. Your free check wasn't used; please try again." });
    }
  }

  const describedBy = `${ids}-hint${state.kind === "error" ? ` ${ids}-error` : ""}`;
  return (
    <div id="check" className="scroll-mt-24">
      <form onSubmit={onSubmit} noValidate className="mt-9">
        <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/10 transition focus-within:ring-2 focus-within:ring-accent-mint/70">
          <label htmlFor={`${ids}-link`} className="sr-only">
            Product link: TikTok Shop, Amazon UK or AliExpress
          </label>
          <input
            ref={linkInput}
            id={`${ids}-link`}
            name="link"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Paste TikTok Shop, Amazon, or AliExpress link..."
            aria-describedby={describedBy}
            aria-invalid={state.kind === "error" || undefined}
            disabled={checking}
            className={field}
          />
          <div className="flex flex-col gap-2 border-t border-white/[0.08] pt-2 sm:flex-row sm:items-center">
            <label htmlFor={`${ids}-price`} className="sr-only">
              Your supplier price per unit, in pounds (optional)
            </label>
            <input
              ref={priceInput}
              id={`${ids}-price`}
              name="supplierPrice"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Supplier price (£)..."
              aria-describedby={describedBy}
              disabled={checking}
              className={field}
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
        </div>
        <p id={`${ids}-hint`} className="mt-3 text-sm text-slate-400">
          No card. Your first verdict needs no account, and your first Dossier is free. Includes TikTok Shop UK&apos;s 9% commission and
          £0.50 self-ship fee, the 15% creator cut and UK VAT.
        </p>
      </form>
      <div aria-live="polite">
        {state.kind === "checking" && (
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-300">
            <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-accent-mint motion-reduce:animate-none" />
            {state.slow ? "Finding it on Amazon UK and checking it live. This can take up to a minute." : "Checking Amazon UK live. This takes about 10–20 seconds."}
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
        {state.kind === "done" && <QuickVerdict result={state.result} />}
      </div>
    </div>
  );
}
