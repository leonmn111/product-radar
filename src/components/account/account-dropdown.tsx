"use client";

import Link from "next/link";
import { useId } from "react";
import { useDropdown } from "@/components/ui/use-dropdown";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const item = `flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 motion-reduce:transition-none dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white ${focusRing}`;

/** The signed-in account button: an initial that opens the email, plan and account links. */
export function AccountDropdown({
  email,
  isPro,
  planLabel,
  signOutAction,
}: {
  email: string;
  isPro: boolean;
  planLabel: string;
  signOutAction: () => Promise<void>;
}) {
  const { open, toggle, close, wrapper, button, panelPosition, onBlur } = useDropdown();
  const panelId = useId();

  return (
    <div ref={wrapper} className="relative" onBlur={onBlur}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={`flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-mint to-emerald-500 text-sm font-semibold text-background-dark uppercase shadow-sm ring-2 ring-line-dark transition hover:scale-105 active:scale-95 motion-reduce:transition-none ${focusRing}`}
      >
        <span aria-hidden="true">{email.charAt(0)}</span>
        <span className="sr-only">Account menu for {email}</span>
      </button>
      {open && (
        <div
          id={panelId}
          className={`absolute top-full ${panelPosition} z-50 mt-2 w-64 rounded-xl bg-white p-1 shadow-xl ring-1 shadow-slate-900/10 ring-slate-200 dark:bg-surface-dark dark:shadow-black/50 dark:ring-white/10`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-2.5 pt-1.5 pb-2.5 dark:border-white/10">
            <p className="min-w-0 truncate text-sm text-slate-600 dark:text-slate-400" title={email}>
              {email}
            </p>
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                isPro
                  ? "bg-accent-mint/10 text-slate-100 ring-accent-mint/30"
                  : "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15"
              }`}
            >
              {planLabel}
            </span>
          </div>
          <div className="py-1">
            <Link href="/dashboard" onClick={() => close()} className={item}>
              Catalog
            </Link>
            <Link href="/library" onClick={() => close()} className={item}>
              Dossier library
            </Link>
            <Link href="/terminal" onClick={() => close()} className={item}>
              Dossier terminal
            </Link>
            <Link href="/account" onClick={() => close()} className={item}>
              Account
            </Link>
            {isPro ? (
              <Link href="/account#billing" onClick={() => close()} className={item}>
                Billing
              </Link>
            ) : (
              <a href="/upgrade" className={`${item} text-accent-mint`}>
                Upgrade to Pro
              </a>
            )}
            <Link href="/docs" onClick={() => close()} className={item}>
              API docs
            </Link>
          </div>
          <form action={signOutAction} className="border-t border-slate-200 pt-1 dark:border-white/10">
            <button type="submit" className={item}>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
