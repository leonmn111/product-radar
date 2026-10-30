import type { Metadata } from "next";
import { Navbar, type NavLink } from "@/components/layout/Navbar";
import { LEGAL } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

// The B2B sales page for TikTok Shop UK agencies (the agency pivot), with a small section for
// e-commerce accountants. Static: no account, no database. The one action is booking a 15-minute
// walkthrough, by email for now (a calendar link can replace BOOK_HREF). Nothing is sold online here:
// the pilot is set up after the call, and its price is shown in pounds up front (CMA).
// Design: the landing page's midnight-blue and mint tokens (globals.css), dark only.

const TITLE = "ProductRadar for agencies — check every client's products before they buy stock";
const DESCRIPTION =
  "One workspace for your TikTok Shop UK clients: bulk product checks, per-product profit after every fee and creator payout, UK VAT handled. Founding Partner Pilot £99 a month.";
const URL = `${SITE_URL}/agencies`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "ProductRadar", title: TITLE, description: DESCRIPTION, url: URL, locale: "en_GB" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const mailto = (subject: string) => `mailto:${LEGAL.contactEmail ?? ""}?subject=${encodeURIComponent(subject)}`;
const BOOK_HREF = mailto("Book a 15-minute ProductRadar walkthrough");
const PARTNER_HREF = mailto("ProductRadar partner programme for accountants");

const PILOT = { name: "Founding Partner Pilot", pricePence: 9900, months: 3 };
const gbp = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0 }).format(pence / 100);

const SECTIONS: NavLink[] = [
  { href: "#pilot", label: "Founding Partner Pilot" },
  { href: "#partners", label: "For accountants" },
];

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
// Midnight text on mint passes WCAG AA comfortably (about 10:1).
const primaryButton = `group inline-flex items-center justify-center gap-2 rounded-xl text-center bg-accent-mint px-6 py-3.5 text-base font-semibold text-on-accent shadow-lg shadow-accent-mint/20 transition duration-200 ease-out hover:scale-[1.03] hover:bg-accent-mint-strong hover:shadow-xl hover:shadow-accent-mint/30 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 ${focusRing}`;
const secondaryButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 px-6 py-3.5 text-base font-semibold text-white ring-1 ring-white/15 transition ring-inset hover:bg-white/10 active:scale-[0.98] motion-reduce:transition-none ${focusRing}`;
const sectionTitle = "text-3xl font-bold tracking-tight text-balance text-white sm:text-4xl";
const eyebrow = "text-sm font-semibold text-accent-mint";

function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-5 shrink-0 text-accent-mint">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
    </svg>
  );
}

function BookButton({ className = "" }: { className?: string }) {
  return (
    <a href={BOOK_HREF} className={`${primaryButton} ${className}`}>
      Book a 15-minute walkthrough
      <Arrow />
    </a>
  );
}

export default function AgenciesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "ProductRadar", url: SITE_URL },
      {
        "@type": "Service",
        name: "ProductRadar for agencies",
        url: URL,
        description: DESCRIPTION,
        provider: { "@id": `${SITE_URL}/#org` },
        areaServed: "GB",
        audience: { "@type": "BusinessAudience", audienceType: "TikTok Shop UK agencies" },
        offers: {
          "@type": "Offer",
          name: PILOT.name,
          price: (PILOT.pricePence / 100).toFixed(2),
          priceCurrency: "GBP",
          priceSpecification: { "@type": "UnitPriceSpecification", price: (PILOT.pricePence / 100).toFixed(2), priceCurrency: "GBP", unitText: "month" },
          eligibleDuration: { "@type": "QuantitativeValue", value: PILOT.months, unitCode: "MON" },
        },
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
      <Navbar links={SECTIONS} ctaHref={BOOK_HREF} ctaLabel="Book a call" />

      <main id="main">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="hero-grid absolute inset-0" />
            <div className="absolute top-[-18rem] left-1/2 h-[36rem] w-[64rem] max-w-[200vw] -translate-x-1/2 rounded-full bg-accent-mint/10 blur-3xl" />
          </div>
          <div className="mx-auto max-w-4xl px-4 pt-14 pb-16 text-center sm:px-6 sm:pt-20 sm:pb-24 lg:px-8 lg:pt-28">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/10 ring-inset sm:text-sm">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-mint" />
              For TikTok Shop UK agencies
            </p>
            <h1 id="hero-title" className="mt-7 text-[2.15rem] leading-[1.1] font-extrabold tracking-tighter text-balance text-white max-[400px]:text-[1.9rem] sm:text-5xl lg:text-[3.4rem]">
              Check every client&apos;s products before they buy stock{" "}
              <span className="text-accent-mint">— and prove what each one actually makes after it sells.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg/8 text-pretty text-slate-300 sm:text-xl/8">
              One workspace for all your TikTok Shop UK clients: bulk product checks, per-product profit after every fee and creator
              payout, UK VAT handled, white-label reports your clients trust.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <BookButton className="w-full sm:w-auto" />
              <a href="#pilot" className={`w-full sm:w-auto ${secondaryButton}`}>
                See the pilot price
              </a>
            </div>
            {/* What's real today: the workspace is being built; founding partners get the reports by hand meanwhile. */}
            <p className="mx-auto mt-5 max-w-xl text-sm text-slate-400">
              Founding partners get these reports hand-delivered today, while we build the automated workspace. The walkthrough is free.
            </p>
          </div>
        </section>

        {/* Founding Partner Pilot */}
        <section id="pilot" aria-labelledby="pilot-title" className="scroll-mt-16 border-y border-line-dark bg-surface-dark/40 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className={eyebrow}>Pricing</p>
              <h2 id="pilot-title" className={`mt-2 ${sectionTitle}`}>
                Become a founding partner
              </h2>
            </div>
            <div className="mx-auto mt-12 max-w-xl">
              <div className="flex flex-col rounded-2xl bg-surface-dark p-6 shadow-xl ring-2 shadow-black/30 ring-accent-mint sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-white">{PILOT.name}</h3>
                  <span className="rounded-full bg-accent-mint/10 px-2.5 py-1 text-xs font-semibold text-accent-mint ring-1 ring-accent-mint/30 ring-inset">
                    For agencies
                  </span>
                </div>
                <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-5xl font-semibold tracking-tight text-white">{gbp(PILOT.pricePence)}</span>
                  <span className="text-base text-slate-300">/ month for {PILOT.months} months</span>
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {gbp(PILOT.pricePence * PILOT.months)} in total for the {PILOT.months} months.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-slate-300">
                  <li className="flex gap-3">
                    <Check />
                    Hand-delivered per-product profit reports and bulk checks from your settlement CSVs while we build the automated connector.
                  </li>
                </ul>
                <BookButton className="mt-8 w-full" />
                <p className="mt-3 text-center text-xs text-slate-400">Nothing to pay online: we set the pilot up with you after the walkthrough.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Partner programme for e-commerce accountants */}
        <section id="partners" aria-labelledby="partners-title" className="scroll-mt-16 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 rounded-2xl bg-white/[0.03] p-6 ring-1 ring-line-dark sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div>
                <p className={eyebrow}>For e-commerce accountants</p>
                <h2 id="partners-title" className="mt-2 text-2xl font-semibold tracking-tight text-balance text-white">
                  Partner programme: 20% recurring commission
                </h2>
                <p className="mt-2 text-sm/6 text-slate-400">
                  Refer your agency and seller clients to ProductRadar and earn a 20% recurring commission. Terms are agreed in writing
                  before your first referral.
                </p>
              </div>
              <a href={PARTNER_HREF} className={`shrink-0 ${secondaryButton}`}>
                Become a partner
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
