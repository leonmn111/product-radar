import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { DossierRunner } from "@/components/DossierRunner";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { createDbCreditStore } from "@/server/billing/credits";
import { freeDossierLeft } from "@/server/billing/welcome";
import { STANDARD_DOSSIER_CREDITS } from "@/server/billing/plans";
import { creditPacksOnSale } from "@/server/billing/sales";
import { liveSources } from "@/server/live/config";
import { SAMPLE_ASIN } from "@/server/sources/sample";
import { ownedDossier } from "@/services/library";

export const metadata: Metadata = {
  title: "Dossier terminal — ProductRadar",
  description: "Run a Standard Dossier for any Amazon UK product, paid in credits.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Terminal({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await getViewer();
  const params = await searchParams;
  const asin = typeof params.asin === "string" && /^[A-Za-z0-9]{10}$/.test(params.asin) ? params.asin.toUpperCase() : undefined;
  const id = typeof params.id === "string" && /^[0-9a-f]{32,64}$/.test(params.id) ? params.id : undefined;
  if (!viewer) redirect(`/signin?callbackUrl=${encodeURIComponent(asin ? `/terminal?asin=${asin}${id ? `&id=${id}` : ""}` : "/terminal")}`);
  const balance = await createDbCreditStore(db).balance(viewer.id);
  // Free reopening: a Dossier this user already bought is shown from their copy, with no charge.
  const reopened = asin || id ? await ownedDossier(db, viewer.id, { asin, id }) : null;
  const live = liveSources({ allowSample: true });
  return (
    <DossierRunner
      balance={balance}
      cost={STANDARD_DOSSIER_CREDITS[viewer.tier]}
      onSale={creditPacksOnSale()}
      unavailable={live.ready ? undefined : "Live Dossiers switch on once the supplier connection (AliExpress) is approved. Nothing will be charged until then."}
      example={live.ready && live.sample ? SAMPLE_ASIN : undefined}
      initialAsin={asin}
      reopened={reopened}
      freeDossier={await freeDossierLeft(db, viewer.id, STANDARD_DOSSIER_CREDITS[viewer.tier])}
    />
  );
}

export default function TerminalPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-background-dark">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-50">Dossier terminal</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            One product, eight parts, every number cited. Parts without enough evidence are withheld, never guessed.
          </p>
        </div>
        <Suspense fallback={<div aria-hidden="true" className="h-[4.5rem] animate-pulse rounded-lg bg-slate-200/70 dark:bg-surface-raised/70" />}>
          <Terminal searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
