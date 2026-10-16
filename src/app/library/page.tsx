import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TopUpButton } from "@/components/account/top-up-button";
import { AppHeader } from "@/components/app-header";
import { DossierLibrary } from "@/components/DossierLibrary";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { freeSearchesLeft } from "@/server/billing/allowances";
import { creditPacksOnSale } from "@/server/billing/sales";

export const metadata: Metadata = {
  title: "Dossier library — ProductRadar",
  description: "Your plan, your credits and every Dossier you've bought.",
  robots: { index: false, follow: false },
};

const TIER_TONE = {
  FREE: "text-zinc-700 ring-zinc-400/40 bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-500/40 dark:bg-zinc-800",
  PRO: "text-purple-800 ring-purple-600/30 bg-purple-50 dark:text-purple-200 dark:ring-purple-400/30 dark:bg-purple-500/15",
  AGENCY: "text-emerald-800 ring-emerald-600/30 bg-emerald-50 dark:text-emerald-200 dark:ring-emerald-400/30 dark:bg-emerald-500/15",
} as const;
const stat = "font-mono text-[11px] tracking-widest text-zinc-600 uppercase dark:text-zinc-400";

async function AccountStrip() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?callbackUrl=%2Flibrary");
  // Read from the database (not the session), so the plan and balance are always current.
  const user = await db.user.findUnique({ where: { id: viewer.id }, select: { subscriptionTier: true, platformCredits: true } });
  if (!user) redirect("/signin?callbackUrl=%2Flibrary");
  const free = await freeSearchesLeft(db, viewer.id);
  return (
    <section aria-label="Your plan and credits" className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-zinc-300 ring-1 ring-zinc-300 sm:grid-cols-4 dark:bg-zinc-800 dark:ring-zinc-800">
      <div className="bg-white p-3 dark:bg-zinc-950">
        <p className={stat}>Plan</p>
        <p className="mt-1">
          <span className={`inline-flex rounded-sm px-1.5 py-0.5 font-mono text-sm font-bold tracking-wider ring-1 ring-inset ${TIER_TONE[user.subscriptionTier]}`}>
            {user.subscriptionTier}
          </span>
        </p>
      </div>
      <div className="bg-white p-3 dark:bg-zinc-950">
        <p className={stat}>Credits</p>
        <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{user.platformCredits}</p>
      </div>
      <div className="bg-white p-3 dark:bg-zinc-950">
        <p className={stat}>Free searches left</p>
        <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{user.subscriptionTier === "PRO" ? free : "—"}</p>
        {user.subscriptionTier !== "PRO" && <p className="text-xs text-zinc-600 dark:text-zinc-400">100 a month on Pro</p>}
      </div>
      <div className="flex flex-col items-start justify-center gap-2 bg-white p-3 dark:bg-zinc-950">
        <TopUpButton balance={user.platformCredits} onSale={creditPacksOnSale()} />
        {user.subscriptionTier === "FREE" && (
          <Link href="/upgrade" className="text-xs font-medium text-purple-700 underline underline-offset-2 dark:text-purple-300">
            Or upgrade to Pro
          </Link>
        )}
      </div>
    </section>
  );
}

export default function LibraryPage() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">Dossier library</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Every Dossier you&apos;ve bought. Reopening one is free.</p>
          </div>
          <Link href="/terminal" className="font-mono text-xs font-semibold tracking-wider text-purple-700 uppercase hover:underline dark:text-purple-300">
            Run a new Dossier →
          </Link>
        </div>
        <Suspense fallback={<div aria-hidden="true" className="h-[5.5rem] animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />}>
          <AccountStrip />
        </Suspense>
        <DossierLibrary />
      </main>
    </div>
  );
}
