import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Check your email — ProductRadar",
  description: "We sent you a sign-in link.",
  robots: { index: false, follow: false },
};

export default function CheckEmailPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-slate-50 px-4 py-12 dark:bg-background-dark">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-line-dark dark:bg-surface-dark">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Check your email</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          We sent you a sign-in link. It works once and expires in 24 hours. You can close this tab.
        </p>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          Didn&apos;t get it? Check spam, or{" "}
          <Link href="/signin" className="font-medium text-accent-mint underline underline-offset-2">
            try again
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
