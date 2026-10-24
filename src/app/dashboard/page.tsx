import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
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
          <h2 id="preview-heading" className="text-base font-semibold text-slate-950 dark:text-white">
            Preview a real dossier
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {products.length === 1 ? "This live product is" : "These live products are"} open to everyone, so you can see
            exactly what Pro shows for every product in the catalog.
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} href={dossierHref(p)} frame="bento" />
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
              : "bg-slate-100 text-slate-800 ring-slate-500/20 dark:bg-surface-raised dark:text-slate-200 dark:ring-slate-400/20"
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
    <div className="min-h-full bg-slate-50 dark:bg-background-dark">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-50">Product intelligence</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Every score is calculated from sourced, timestamped evidence. Open a product to see exactly which evidence
            each score is based on.
          </p>
        </div>
        <Suspense
          fallback={
            <div aria-hidden="true" className="space-y-3">
              <div className="h-14 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-white/5" />
              <div className="h-96 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-white/5" />
            </div>
          }
        >
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
