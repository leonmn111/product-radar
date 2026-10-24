import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { formatDateTime, formatPrice, getScore, humanizeSlug } from "@/components/dashboard/format";
import { OpportunityDossier } from "@/components/dashboard/opportunity-dossier";
import { ProductImage } from "@/components/dashboard/product-card";
import { ConfidenceBadge } from "@/components/dashboard/score";
import { UpgradeCard } from "@/components/dashboard/upgrade-card";
import { db } from "@/lib/db";
import { canIngest, canViewCatalog, canViewDossier, getViewer } from "@/server/auth/entitlements";
import { getProductBySlug, type ProductDto } from "@/server/products/service";
import { getShowcase } from "@/server/products/showcase-cache";

type Params = PageProps<"/dossier/[slug]">["params"];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await db.product.findUnique({ where: { slug }, select: { name: true } });
  return {
    title: product ? `${product.name} — Dossier | ProductRadar` : "Dossier not found | ProductRadar",
    description: "Evidence-backed opportunity dossier: verdict, margin and arbitrage after fees, profit calculator and sources.",
    robots: { index: false, follow: false },
  };
}

function ProductSummary({ product: p }: { product: ProductDto }) {
  const overall = getScore(p, "OVERALL");
  return (
    <section aria-labelledby="product-name" className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="w-full max-w-56 shrink-0 self-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:w-48 sm:self-start dark:border-line-dark">
        <ProductImage src={p.imageUrl} alt={p.name} label={p.brand ?? p.name} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide text-accent-mint uppercase">
          {p.brand && <span>{p.brand}</span>}
          <span
            className={`rounded-md px-1.5 py-0.5 tracking-normal normal-case ring-1 ring-inset ${
              p.isSample
                ? "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20"
                : "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20"
            }`}
          >
            {p.isSample ? "Sample" : "Live"}
          </span>
        </p>
        <h1 id="product-name" className="mt-1 text-2xl font-semibold tracking-tight text-balance text-slate-950 sm:text-3xl dark:text-white">
          {p.name}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{humanizeSlug(p.category)}</p>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-4">
          <div>
            <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">Overall score</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">
                {overall ? Math.round(overall.value) : "—"}
                <span className="text-sm font-normal text-slate-400 dark:text-slate-400"> / 100</span>
              </span>
              {overall && <ConfidenceBadge confidence={overall.confidence} />}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">Lowest current price</dt>
            <dd className="mt-1">
              {p.bestOffer ? (
                <>
                  <span className="text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">
                    {formatPrice(p.bestOffer.price.amount, p.bestOffer.price.currency)}
                  </span>
                  <span className="block text-xs text-slate-600 dark:text-slate-400">
                    at {p.bestOffer.merchant}, seen {formatDateTime(p.bestOffer.observedAt)}
                  </span>
                </>
              ) : (
                <span className="text-sm text-slate-600 dark:text-slate-400">No current offer</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">Evidence</dt>
            <dd className="mt-1 text-sm text-slate-950 dark:text-slate-100">
              <span className="text-2xl font-semibold tabular-nums">{p.sourceCount}</span> source{p.sourceCount === 1 ? "" : "s"}
              <span className="block text-xs text-slate-600 dark:text-slate-400">
                {p.evidenceCount} evidence item{p.evidenceCount === 1 ? "" : "s"}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** A live product outside the public showcase, opened by a Free account. */
function LockedDossier({ name, liveProducts }: { name: string; liveProducts: number }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-slate-950 sm:text-3xl dark:text-white">{name}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This product&apos;s dossier is part of the Pro catalog.
        </p>
      </div>
      <UpgradeCard signedIn liveProducts={liveProducts} />
    </div>
  );
}

async function DossierContent({ params }: { params: Params }) {
  const { slug } = await params;
  await connection(); // per request: the product read below uses the current time
  const [viewer, product] = await Promise.all([getViewer(), getProductBySlug(db, slug)]);
  if (!product) notFound();

  const showcase = await getShowcase();
  const showcased = showcase.products.some((p) => p.id === product.id);
  if (!canViewDossier(viewer, { isSample: product.isSample, showcased })) {
    if (!viewer) redirect(`/signin?callbackUrl=${encodeURIComponent(`/dossier/${slug}`)}`);
    return <LockedDossier name={product.name} liveProducts={showcase.stats.products} />;
  }

  const pro = canViewCatalog(viewer);
  return (
    <div className="space-y-6">
      <Link
        href={pro ? "/dashboard" : "/"}
        className={`inline-flex items-center gap-1 rounded-sm text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white ${focusRing}`}
      >
        <span aria-hidden="true">←</span> {pro ? "Back to catalog" : "Back to ProductRadar"}
      </Link>
      <ProductSummary product={product} />
      {showcased && !pro && (
        <p className="rounded-lg bg-accent-mint/10 px-4 py-3 text-sm text-slate-100 ring-1 ring-accent-mint/30 ring-inset">
          <strong className="font-semibold">Free preview.</strong> This live product is open to everyone. Pro opens a
          dossier like this for every product in the catalog.
        </p>
      )}
      <OpportunityDossier product={product} viewer={{ signedIn: viewer !== null, proTools: canIngest(viewer) }} />
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Scores are calculated estimates (0–100) with a confidence (0–1), derived only from the linked evidence. They
        are not guarantees.
      </p>
    </div>
  );
}

export default function DossierPage({ params }: { params: Params }) {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-background-dark">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <Suspense
          fallback={
            <div aria-hidden="true" className="space-y-4">
              <div className="h-5 w-32 animate-pulse rounded bg-slate-200/70 dark:bg-surface-raised/70" />
              <div className="h-48 animate-pulse rounded-xl bg-slate-200/70 dark:bg-surface-raised/70" />
              <div className="h-40 animate-pulse rounded-xl bg-slate-200/70 dark:bg-surface-raised/70" />
              <div className="h-72 animate-pulse rounded-xl bg-slate-200/70 dark:bg-surface-raised/70" />
            </div>
          }
        >
          <DossierContent params={params} />
        </Suspense>
      </main>
    </div>
  );
}
