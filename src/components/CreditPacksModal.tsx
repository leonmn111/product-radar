"use client";

// The credit packs, in a modal: Starter, Growth and Scale, each bought through Stripe Checkout
// (POST /api/stripe/checkout). A native <dialog>, so focus stays inside it and Escape closes it.
// While a pack is opening, its button says so and the others wait; an error is shown in place.

import { useEffect, useId, useRef, useState } from "react";
import { balanceGbp, CREDIT_PACKS, CREDIT_VALUE_PENCE, creditsGbp, gbp, STANDARD_DOSSIER_CREDITS, type CreditPackId } from "@/server/billing/plans";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const PACKS = Object.values(CREDIT_PACKS);
const BEST = PACKS.reduce((a, b) => (a.pricePence / a.credits <= b.pricePence / b.credits ? a : b)).id;

export function CreditPacksModal({
  open,
  onClose,
  onSale,
  balance,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  /** False until credit packs are on sale: the packs show, the buttons don't work yet. */
  onSale: boolean;
  balance: number;
  /** Why the modal opened, e.g. "A Standard Dossier costs 4 credits; you have 2." */
  reason?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState<CreditPackId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Coming back from Stripe with the browser's Back button can restore this page as it was left.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setPending(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function buy(id: CreditPackId) {
    setPending(id);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tier: id }) });
      const body = (await res.json().catch(() => null)) as { url?: unknown; message?: unknown } | null;
      if (res.ok && typeof body?.url === "string" && body.url.startsWith("https://")) {
        window.location.assign(body.url); // stays "Opening Stripe…" until the page changes
        return;
      }
      setError(typeof body?.message === "string" ? body.message : "We couldn't open checkout just now. Please try again.");
    } catch {
      setError("We couldn't reach ProductRadar. Check your connection and try again.");
    }
    setPending(null);
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the backdrop (the dialog itself, outside its panel) closes it.
      onClick={(e) => e.target === e.currentTarget && !pending && dialog.current?.close()}
      className="light-island fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl bg-white p-0 text-slate-900 shadow-2xl ring-1 ring-gray-300 backdrop:bg-background-dark/70 dark:bg-background-dark dark:text-slate-50 dark:ring-line-dark"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              Top up your balance
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Your balance is <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-white">{balanceGbp(balance)}</span>. A
              Standard Dossier costs {creditsGbp(STANDARD_DOSSIER_CREDITS.FREE)} ({creditsGbp(STANDARD_DOSSIER_CREDITS.PRO)} on Pro), a search {creditsGbp(1)}.
            </p>
            {reason && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">{reason}</p>}
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            disabled={pending !== null}
            className={`-mt-1 -mr-1 rounded-lg p-2 text-slate-600 hover:bg-gray-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white ${focusRing}`}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
            <span className="sr-only">Close</span>
          </button>
        </div>

        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {PACKS.map((p) => {
            const busy = pending === p.id;
            return (
              <li
                key={p.id}
                className={`relative flex flex-col rounded-lg p-4 ring-1 ${p.id === BEST ? "ring-2 ring-accent-mint" : "ring-gray-300 dark:ring-line-dark"}`}
              >
                {p.id === BEST && (
                  <span className="absolute -top-2.5 left-4 rounded-sm bg-accent-mint px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-on-accent uppercase">
                    Best value
                  </span>
                )}
                <p className="font-mono text-[11px] font-semibold tracking-widest text-slate-600 uppercase dark:text-slate-400">{p.name}</p>
                <p className="mt-2 font-mono text-3xl font-bold tracking-tight tabular-nums">{gbp(p.pricePence)}</p>
                <p className="mt-3 text-sm">
                  <span className="font-semibold tabular-nums">{balanceGbp(p.credits)}</span>
                  <span className="text-slate-600 dark:text-slate-400"> added to your balance</span>
                </p>
                {p.credits * CREDIT_VALUE_PENCE > p.pricePence && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">includes a {gbp(p.credits * CREDIT_VALUE_PENCE - p.pricePence)} bonus</p>
                )}
                <button
                  type="button"
                  onClick={() => buy(p.id)}
                  disabled={!onSale || pending !== null}
                  aria-busy={busy}
                  className={`mt-4 inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed motion-reduce:transition-none ${
                    p.id === BEST
                      ? "bg-accent-mint text-on-accent hover:bg-accent-mint-strong disabled:bg-accent-mint/50"
                      : "bg-surface-dark text-white hover:bg-surface-raised disabled:bg-surface-dark/40 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:disabled:bg-white/40"
                  } ${focusRing}`}
                >
                  {busy && <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />}
                  {busy ? "Opening Stripe…" : `Buy for ${gbp(p.pricePence)}`}
                </button>
              </li>
            );
          })}
        </ul>

        <div aria-live="polite" className="mt-4 min-h-5 text-sm">
          {error ? (
            <p role="alert" className="text-red-700 dark:text-red-300">
              {error}
            </p>
          ) : !onSale ? (
            <p className="text-slate-600 dark:text-slate-400">Top-ups aren&apos;t available right now. Nothing has been charged.</p>
          ) : (
            <p className="text-slate-600 dark:text-slate-400">Secure checkout by Stripe. It brings you back to your account when you&apos;re done.</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
