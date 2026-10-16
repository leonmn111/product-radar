import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { DossierRunner } from "@/components/DossierRunner";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { createDbCreditStore } from "@/server/billing/credits";
import { STANDARD_DOSSIER_CREDITS } from "@/server/billing/plans";
import { creditPacksOnSale } from "@/server/billing/sales";
import { liveSources } from "@/server/live/config";
import { SAMPLE_ASIN } from "@/server/sources/sample";

export const metadata: Metadata = {
  title: "Dossier terminal — ProductRadar",
  description: "Run a Standard Dossier for any Amazon UK product, paid in credits.",
  robots: { index: false, follow: false },
};

async function Terminal() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?callbackUrl=%2Fterminal");
  const balance = await createDbCreditStore(db).balance(viewer.id);
  const live = liveSources({ allowSample: true });
  return (
    <DossierRunner
      balance={balance}
      cost={STANDARD_DOSSIER_CREDITS[viewer.tier]}
      onSale={creditPacksOnSale()}
      unavailable={live.ready ? undefined : "Live Dossiers switch on once the supplier connection (AliExpress) is approved. Nothing will be charged until then."}
      example={live.ready && live.sample ? SAMPLE_ASIN : undefined}
    />
  );
}

export default function TerminalPage() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">Dossier terminal</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            One product, eight parts, every number cited. Parts without enough evidence are withheld, never guessed.
          </p>
        </div>
        <Suspense fallback={<div aria-hidden="true" className="h-[4.5rem] animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />}>
          <Terminal />
        </Suspense>
      </main>
    </div>
  );
}
