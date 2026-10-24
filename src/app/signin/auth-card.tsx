import Link from "next/link";
import type { ReactNode } from "react";

/** The centred card that every sign-in screen sits in. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-slate-50 px-4 py-12 dark:bg-background-dark">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-line-dark dark:bg-surface-dark">
        <Link
          href="/"
          className="text-sm font-semibold text-accent-mint hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint"
        >
          ← ProductRadar
        </Link>
        <div className="mt-4">{children}</div>
      </div>
    </main>
  );
}

export const linkClass =
  "font-medium text-accent-mint underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
