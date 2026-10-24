import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DossierTerminal } from "@/components/DossierTerminal";
import { env } from "@/lib/env";
import type { RetailListing, SupplierOffer } from "@/server/live/types";
import recordedSearch from "@/server/sources/rainforest/fixtures/search-amazon-co-uk-recorded.json";
import { parseRainforestSearch, type RainforestSearchResponse } from "@/server/sources/rainforest/parse";
import { fetchLongestRunningAd } from "@/server/sources/metaAds";
import { SAMPLE_ASIN, sampleHistorySource, sampleRetailSource, sampleSupplierSource } from "@/server/sources/sample";
import { QueryBudget } from "@/server/live/budget";
import { buildDossier, fetchProductDossierData } from "@/services/dossierService";

// /dev/terminal: development-only preview of the Dossier terminal in its three main states.
// Not served in production (404). No provider is called: real recorded Amazon UK responses, the
// made-up AliExpress sample offers, and one clearly labelled illustrative product.

export const metadata: Metadata = { title: "Dossier terminal preview (development)", robots: { index: false, follow: false } };

/** Illustrative only: a made-up unbranded product with enough made-up evidence to show every number. */
async function illustrative(now: Date) {
  // The SAMPLE Keepa history and a SIMULATED ad duration, so Momentum shows too.
  const sampleHistory = await sampleHistorySource.history(SAMPLE_ASIN, new QueryBudget({ maxCalls: 1, deadlineMs: 5_000 }));
  const history = sampleHistory && { ...sampleHistory, asin: "B0EXAMPLE1" };
  const observedAt = now.toISOString();
  const listing = (n: number, price: number): RetailListing => ({
    market: "GB",
    id: `B0EXAMPLE${n}`,
    title: "Plain White Ceramic Coffee Mug 350ml",
    url: `https://www.example.com/listing-${n}`,
    image: null,
    price: { amount: price, currency: "GBP" },
    rating: null,
    ratingsTotal: null,
    sponsored: false,
    recentSales: null,
    evidence: { id: `example:listing:${n}`, provider: "illustrative", sourceUrl: `https://www.example.com/listing-${n}`, observedAt, quality: 90, claim: `Illustrative listing at £${price.toFixed(2)}` },
  });
  const offer = (n: number, price: number): SupplierOffer => ({
    id: `example-supplier-${n}`,
    title: "Ceramic Coffee Mug 350ml White Plain",
    url: `https://www.example.com/supplier-${n}`,
    image: null,
    unitPrice: { amount: price, currency: "GBP" },
    shipping: null,
    shipsTo: "GB",
    evidence: { id: `example:supplier:${n}`, provider: "illustrative", sourceUrl: `https://www.example.com/supplier-${n}`, observedAt, quality: 80, claim: `Illustrative supplier offer at £${price.toFixed(2)}` },
  });
  return buildDossier(
    {
      query: "ceramic coffee mug",
      ukListings: [listing(1, 12.99), listing(2, 13.49), listing(3, 12.49), listing(4, 14.99)],
      suppliers: [offer(1, 2.1), offer(2, 2.4)],
      sample: true,
      history,
      adDuration: { days: fetchLongestRunningAd("illustrative"), method: "simulated" },
      notes: ["ILLUSTRATIVE: every listing, offer and number in this Dossier is made up, to show a fully populated terminal."],
    },
    { id: "preview-illustrative-0000", now },
  );
}

async function Previews() {
  await connection();
  const now = new Date();

  // 1. Real recorded Amazon UK product page (+ the made-up AliExpress sample offers): not sellable.
  const data = await fetchProductDossierData(SAMPLE_ASIN, { retail: sampleRetailSource, supplier: sampleSupplierSource });
  const notSellable = buildDossier(
    { ...data!, sample: true, notes: [...(data!.notes ?? []), "Development sample data: the supplier offers are made up."] },
    { id: "preview-not-sellable-0000", now },
  );

  // 2. One real recorded listing and nothing else: too little evidence for a verdict.
  const one = parseRainforestSearch(recordedSearch as RainforestSearchResponse, "GB", now).find((l) => l.id === "B0H5CFV9LL")!;
  const thin = buildDossier({ query: "magnetic power bank", ukListings: [one], suppliers: [] }, { id: "preview-withheld-00000", now });

  const cases = [
    { key: "withheld", label: "Verdict withheld: one real recorded Amazon UK listing, no supplier", dossier: thin },
    { key: "not-sellable", label: "Not sellable: the real recorded UGREEN product page (sample suppliers)", dossier: notSellable },
    { key: "full", label: "Every part shown: an ILLUSTRATIVE made-up product", dossier: await illustrative(now) },
  ];
  return (
    <>
      <nav aria-label="Preview cases" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {cases.map((c, i) => (
          <a key={c.key} href={`#${c.key}`} className="underline underline-offset-2">
            {i + 1}. {c.label}
          </a>
        ))}
      </nav>
      {cases.map((c, i) => (
        <section key={c.key} id={c.key} aria-label={c.label} className="scroll-mt-4 space-y-2">
          <p className="font-mono text-xs tracking-wider text-slate-600 uppercase dark:text-slate-400">
            Case {i + 1} of {cases.length}: {c.label}
          </p>
          <DossierTerminal dossier={c.dossier} />
        </section>
      ))}
    </>
  );
}

export default function TerminalPreviewPage() {
  if (env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-xl font-semibold">Dossier terminal preview</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">Development only: this page doesn&apos;t exist in production. No provider is called.</p>
      <Suspense fallback={<p className="text-sm">Building previews…</p>}>
        <Previews />
      </Suspense>
    </main>
  );
}
