import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { EuDutyCalculator } from "@/components/tools/eu-duty-calculator";
import { EU_HANDLING_FEE_EVIDENCE } from "@/engine/policy";
import { SITE_URL } from "@/lib/site";
import { LATEST_FX } from "@/server/scoring/fx-latest";

// The free EU duty calculator: a search landing page for UK sellers looking up the EU's low-value parcel
// charges (the €3 customs duty since 1 July 2026, the €2 Union handling fee from 1 November 2026). Static;
// the calculator runs in the browser (engine/euDuty.ts). Every rule it states is cited below it. The one
// onward action is the homepage check for UK margins.

const TITLE = "Free EU €3 Duty & €2 Handling Fee Calculator for UK Sellers (2026)";
const DESCRIPTION =
  "Free calculator for UK sellers: your margin on parcels to EU customers after the €3 customs duty and the new €2 handling fee from 1 November 2026. EU VAT included, no account needed.";
const URL = `${SITE_URL}/tools/eu-duty-calculator`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "ProductRadar", title: TITLE, description: DESCRIPTION, url: URL, locale: "en_GB" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const GBP_PER_EUR = LATEST_FX.perEur.GBP;
const FX_DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${LATEST_FX.date}T00:00:00Z`));
const SOURCE = EU_HANDLING_FEE_EVIDENCE.sourceUrl; // Irish Revenue, 29 September 2026: both charges

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const link = `font-medium text-accent-mint underline underline-offset-2 hover:text-accent-mint-strong ${focusRing}`;

const FAQ = [
  {
    q: "When does the EU's €2 handling fee start?",
    a: "On 1 November 2026. It's €2 per distinct item in a package (identical items count once) on e-commerce goods sent from outside the EU to consumers, whatever their value, and it's separate from the €3 customs duty.",
  },
  {
    q: "Does the €3 customs duty apply to every parcel?",
    a: "Since 1 July 2026 it applies per item type to packages worth €150 or less sent from outside the EU to consumers. Above €150 the goods' own customs duty applies instead, for example 12% on jeans and 16.9% on trainers.",
  },
  {
    q: "Who pays the new charges?",
    a: "The seller, or the business delivering the goods. A seller can pass them on to the customer at checkout or on delivery; this calculator assumes you pay them, so you see what they do to your margin.",
  },
];

export default function EuDutyCalculatorPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "ProductRadar", url: SITE_URL },
      {
        "@type": "WebApplication",
        name: "EU duty and handling fee calculator",
        url: URL,
        description: DESCRIPTION,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
        publisher: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };

  return (
    <div className="flex-1 bg-background-dark text-slate-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-accent-mint focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-on-accent"
      >
        Skip to content
      </a>
      <Navbar ctaHref="/#check" ctaLabel="Free check" />

      <main id="main" className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-16 lg:px-8">
        <p className="inline-flex items-center gap-2 rounded-full bg-accent-mint/10 px-3 py-1 text-xs font-semibold text-accent-mint ring-1 ring-accent-mint/30 ring-inset sm:text-sm">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-mint" />
          Updated for the Nov 1, 2026 €2 handling fee.
        </p>
        <h1 className="mt-5 max-w-4xl text-3xl leading-tight font-extrabold tracking-tight text-balance text-white sm:text-5xl">
          UK to EU Duty Calculator: See your margin after the new €3 duty and €2 handling fee.
        </h1>
        <p className="mt-4 max-w-3xl text-lg/8 text-slate-300">
          Free, with no account. Enter your sale price, supplier cost and shipping: your margin updates as you type, with EU VAT, the €3 customs duty
          and the €2 Union handling fee taken off.
        </p>

        <div className="mt-10">
          <EuDutyCalculator gbpPerEur={GBP_PER_EUR} fxDate={FX_DATE} />
        </div>

        {/* The upsell: the homepage check for UK margins. */}
        <section aria-labelledby="uk-check-title" className="mt-10 flex flex-col gap-5 rounded-2xl bg-accent-mint/10 p-6 ring-1 ring-accent-mint/30 ring-inset sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <h2 id="uk-check-title" className="max-w-2xl text-xl font-semibold text-balance text-white sm:text-2xl">
            Don&apos;t guess your UK margins either. Paste your product link and supplier price to get a full UK Pre-order Check.
          </h2>
          <Link
            href="/#check"
            className={`group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent-mint px-6 py-3.5 text-base font-semibold text-on-accent shadow-lg shadow-accent-mint/20 transition hover:bg-accent-mint-strong active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
          >
            Check a product free
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
              →
            </span>
          </Link>
        </section>

        <section aria-labelledby="faq-title" className="mt-14 max-w-3xl">
          <h2 id="faq-title" className="text-2xl font-bold tracking-tight text-white">
            The 2026 EU parcel charges, in brief
          </h2>
          <dl className="mt-6 space-y-6">
            {FAQ.map(({ q, a }) => (
              <div key={q}>
                <dt className="font-semibold text-white">{q}</dt>
                <dd className="mt-1 text-sm/6 text-slate-300">{a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs text-slate-400">
            Source:{" "}
            <a href={SOURCE} target="_blank" rel="noopener noreferrer" className={link}>
              Revenue (Irish Tax and Customs), press release of 29 September 2026
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            , which covers both the €3 duty and the €2 fee. VAT rates from the European
            Commission&apos;s VAT rates database. Exchange rate: the European Central Bank&apos;s reference rate of {FX_DATE}.
          </p>
        </section>
      </main>
    </div>
  );
}
