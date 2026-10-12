"use client";

import { useEffect, useState, type FormEvent } from "react";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400";
const STYLE = {
  primary: `bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:text-zinc-950 dark:hover:bg-indigo-400 ${focusRing}`,
  secondary: `bg-white text-zinc-900 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800 ${focusRing}`,
};

/**
 * Opens Stripe's customer portal: asks /api/billing/portal for a session URL and
 * goes there. Without JavaScript the form falls back to /billing/manage, which
 * redirects to the same portal.
 */
export function ManageBillingButton({ label, variant = "primary" }: { label: string; variant?: keyof typeof STYLE }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coming back with the browser's Back button can restore this page as it was left ("Opening…").
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function open(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { url?: unknown; message?: unknown } | null;
      if (res.ok && typeof body?.url === "string" && body.url.startsWith("https://")) {
        window.location.assign(body.url);
        return;
      }
      setError(typeof body?.message === "string" ? body.message : "We couldn't open billing just now. Please try again.");
    } catch {
      setError("We couldn't reach ProductRadar. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <form action="/billing/manage" method="get" onSubmit={open}>
      <button
        type="submit"
        disabled={pending}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm disabled:cursor-wait disabled:opacity-70 sm:w-auto ${STYLE[variant]}`}
      >
        {pending && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
        {pending ? "Opening Stripe…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
