import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { confirmCheckout } from "@/server/billing/checkout";
import { creditsGbp, PLANS, STANDARD_DOSSIER_CREDITS } from "@/server/billing/plans";

export const metadata: Metadata = {
  title: "Welcome to Pro — ProductRadar",
  description: "Your ProductRadar Pro subscription.",
  robots: { index: false, follow: false },
};

async function Confirmation({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?callbackUrl=%2Fdashboard");
  if (!session_id || !/^cs_[A-Za-z0-9_]+$/.test(session_id)) redirect("/dashboard");

  let result: Awaited<ReturnType<typeof confirmCheckout>>;
  try {
    result = await confirmCheckout(db, viewer.id, session_id);
  } catch (e) {
    console.error("[billing] confirm checkout failed", e);
    result = { ok: false, reason: "We couldn't confirm your payment just now — it will update automatically within a minute." };
  }

  return result.ok && result.tier !== "FREE" ? (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">You&apos;re on {result.tier === "AGENCY" ? "Agency" : "Pro"} 🎉</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {result.tier === "AGENCY" ? "Your monthly balance is added as soon as Stripe confirms the invoice." : `Dossiers now cost ${creditsGbp(STANDARD_DOSSIER_CREDITS.PRO)} from your balance, and ${PLANS.pro.monthly.freeSearches} Amazon UK searches a month are free.`}
        {result.periodEnd &&
          ` Your plan renews on ${new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(result.periodEnd)}.`}
      </p>
    </>
  ) : (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Almost there</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {result.ok ? "Your payment is still processing." : result.reason} You haven&apos;t been charged twice — refresh
        this page in a moment.
      </p>
    </>
  );
}

export default function BillingSuccessPage(props: { searchParams: Promise<{ session_id?: string }> }) {
  return (
    <main className="app-light flex min-h-full flex-1 items-center justify-center bg-gray-50 px-4 py-12 text-slate-900">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-line-dark dark:bg-surface-dark">
        <Suspense fallback={<p className="text-sm text-slate-600 dark:text-slate-400">Confirming your subscription…</p>}>
          <Confirmation searchParams={props.searchParams} />
        </Suspense>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-md bg-accent-mint px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-mint-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint "
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
