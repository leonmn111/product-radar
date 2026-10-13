import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account/account-menu";
import { dossierHref } from "@/components/dashboard/format";
import { ProductCard } from "@/components/dashboard/product-card";
import { ProductDashboard } from "@/components/dashboard/product-dashboard";
import { UpgradeCard } from "@/components/dashboard/upgrade-card";
import { canIngest, canViewCatalog, getViewer } from "@/server/auth/entitlements";
import { getShowcase } from "@/server/products/showcase-cache";

export const metadata: Metadata = {
  title: "Catalog — ProductRadar",
  description: "Your ProductRadar product catalog: evidence-backed scores, price gaps and dossiers.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const BILLING_NOTICE: Record<string, { tone: "info" | "error"; text: string }> = {
  cancelled: { tone: "info", text: "Checkout cancelled — you haven't been charged." },
  unavailable: { tone: "error", text: "Upgrades aren't available yet: billing hasn't been set up on this server." },
  error: { tone: "error", text: "We couldn't reach the payment provider. Please try again in a moment." },
};

/** Free accounts: the Pro offer, plus the public showcase dossiers to look at meanwhile. */
async function ProGate() {
  const { products, stats } = await getShowcase();
  return (
    <div className="space-y-8">
      <UpgradeCard signedIn liveProducts={stats.products} />
      {products.length > 0 && (
        <section aria-labelledby="preview-heading">
          <h2 id="preview-heading" className="text-base font-semibold text-zinc-950 dark:text-white">
            Preview a real dossier
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {products.length === 1 ? "This live product is" : "These live products are"} open to everyone, so you can see
            exactly what Pro shows for every product in the catalog.
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} href={dossierHref(p)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  if (!viewer) redirect("/signin?callbackUrl=%2Fdashboard");
  const key = params.checkout === "cancelled" ? "cancelled" : typeof params.billing === "string" ? params.billing : null;
  const notice = key ? BILLING_NOTICE[key] : undefined;

  return (
    <>
      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mb-4 rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${
            notice.tone === "error"
              ? "bg-red-50 text-red-900 ring-red-600/20 dark:bg-red-950/30 dark:text-red-200 dark:ring-red-400/30"
              : "bg-zinc-100 text-zinc-800 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-400/20"
          }`}
        >
          {notice.text}
        </p>
      )}
      {canViewCatalog(viewer) ? (
        <ProductDashboard viewer={{ signedIn: true, canIngest: canIngest(viewer) }} />
      ) : (
        <ProGate />
      )}
    </>
  );
}

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
          <div className="flex flex-col gap-1">
            <Link
              href="/"
              className="self-start rounded-sm text-sm font-semibold tracking-tight text-indigo-700 hover:text-indigo-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-indigo-300 dark:hover:text-indigo-200 dark:focus-visible:outline-indigo-400"
            >
              ProductRadar
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">
              Product intelligence
            </h1>
            <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Every score is calculated from sourced, timestamped evidence. Open a product to see exactly which
              evidence each score is based on.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:justify-end">
            <Link
              href="/docs"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus-visible:outline-indigo-400"
            >
              API for agents
            </Link>
            <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />}>
              <AccountMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Suspense
          fallback={
            <div aria-hidden="true" className="space-y-3">
              <div className="h-40 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
              <div className="h-96 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
            </div>
          }
        >
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
