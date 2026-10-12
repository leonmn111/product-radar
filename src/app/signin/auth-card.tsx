import Link from "next/link";
import type { ReactNode } from "react";

/** The centred card that every sign-in screen sits in. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/"
          className="text-sm font-semibold text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-indigo-300"
        >
          ← ProductRadar
        </Link>
        <div className="mt-4">{children}</div>
      </div>
    </main>
  );
}

export const linkClass =
  "font-medium text-indigo-700 underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-indigo-300";
