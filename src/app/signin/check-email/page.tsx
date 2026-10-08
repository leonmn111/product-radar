import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Check your email — ProductRadar",
  description: "We sent you a sign-in link.",
  robots: { index: false, follow: false },
};

export default function CheckEmailPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">Check your email</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          We sent you a sign-in link. It works once and expires in 24 hours. You can close this tab.
        </p>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Didn&apos;t get it? Check spam, or{" "}
          <Link href="/signin" className="font-medium text-indigo-700 underline underline-offset-2 dark:text-indigo-300">
            try again
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
