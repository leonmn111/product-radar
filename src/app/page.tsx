import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Navbar, type NavLink } from "@/components/layout/Navbar";
import { HeroAssembly } from "@/components/landing/hero-assembly";
import { LiveStats, LiveStatsSkeleton } from "@/components/landing/live-stats";
import { PasteBox } from "@/components/landing/paste-box";
import { Platform, PlatformSkeleton } from "@/components/landing/platform";
import { Showcase, type ShowcaseProduct } from "@/components/landing/showcase";
import { TiltTerminal } from "@/components/landing/tilt-terminal";
import { TrustBento } from "@/components/landing/trust-bento";
import { SITE_URL } from "@/lib/site";
import { PLANS } from "@/server/billing/plans";
import { getShowcase } from "@/server/products/showcase-cache";

// The public landing page. Signed-in visitors never see it: src/proxy.ts sends them
// to /dashboard. Everything here is static except the live counts and the showcase,
// which stream in from the database (cached for about an hour).
// Design: the midnight-blue and mint-green tokens in globals.css (the site is dark only).

const TITLE = "ProductRadar — Institutional-grade product research for Amazon & AliExpress";
const DESCRIPTION =
  "Product research for UK resellers: an 8-part Dossier per product with true landed margin after VAT, duty and fees, resellability checks, supplier matches and every source cited.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "ProductRadar", title: TITLE, description: DESCRIPTION, url: SITE_URL, locale: "en_GB" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// Sign up: /get-started sends new accounts to the Dossier terminal once live Dossiers are on, and to
// the dashboard (Pro offer and showcase) until then. Free to create, nothing to pay up front.
const GET_STARTED = "/get-started";
const PRO_PRICE = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
}).format(PLANS.pro.pricePence / 100);

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
// Midnight text on mint passes WCAG AA comfortably (about 10:1); it glows and grows on hover.
const primaryButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-accent-mint px-6 py-3.5 text-base font-semibold text-background-dark shadow-lg shadow-accent-mint/20 transition duration-200 ease-out hover:scale-[1.03] hover:bg-accent-mint-strong hover:shadow-xl hover:shadow-accent-mint/30 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 ${focusRing}`;
const secondaryButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 px-6 py-3.5 text-base font-semibold text-white ring-1 ring-white/15 transition ring-inset hover:bg-white/10 active:scale-[0.98] motion-reduce:transition-none ${focusRing}`;
const sectionTitle = "text-3xl font-bold tracking-tight text-balance text-white sm:text-4xl";
const eyebrow = "text-sm font-semibold text-accent-mint";

// ── Small pieces ─────────────────────────────────────────────────────────────

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
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CallToAction({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:justify-center ${className}`}>
      <Link href={GET_STARTED} className={`group ${primaryButton}`}>
        Create a free account
        <Arrow />
      </Link>
      <Link href="/signin" className={secondaryButton}>
        Sign in
      </Link>
    </div>
  );
}

// ── Navigation ───────────────────────────────────────────────────────────────

const SECTIONS: NavLink[] = [
  { href: "#platform", label: "Platform" },
  { href: "#showcase", label: "Showcase" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#agents", label: "For agents" },
  { href: "#pricing", label: "Pricing" },
];

// ── Streamed sections ────────────────────────────────────────────────────────

async function HeroStats() {
  await connection(); // per request (cached ~1h), never during the build
  const { stats } = await getShowcase();
  return <LiveStats stats={stats} />;
}

async function ShowcaseContent() {
  await connection();
  const { products: all } = await getShowcase();
  // Only the real-price resale routes go to the browser; v1's benchmark wholesale estimate stays out.
  const products: ShowcaseProduct[] = all.map(({ margin, ...p }) => ({
    ...p,
    margin: margin && { arbitrage: margin.arbitrage, arbitrageOwnStore: margin.arbitrageOwnStore },
  }));
  if (products.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-dark p-8 text-center text-sm text-slate-400">
        No two stores are selling the same product at different prices right now, so there&apos;s no live price gap to
        show. Pro members see the full catalog either way.
      </p>
    );
  }
  return <Showcase products={products} />;
}

function ShowcaseSkeleton() {
  const block = "animate-pulse rounded-2xl bg-white/5";
  return (
    <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className={`h-[30rem] sm:row-span-3 lg:row-span-2 ${block}`} />
      <div className={`h-44 lg:col-span-2 ${block}`} />
      <div className={`h-60 ${block}`} />
      <div className={`h-60 ${block}`} />
    </div>
  );
}

// ── Static content ───────────────────────────────────────────────────────────

const STEPS = [
  {
    title: "Add a product page",
    body: "Paste a link to any product in a store. ProductRadar reads the price, star rating and review count from the page itself, and adds other stores and reviews as evidence.",
    icon: "M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244",
  },
  {
    title: "Every number gets a source",
    body: "Each score is calculated from evidence with its link, the time it was read and a quality rating. Thin evidence lowers the confidence, and the dossier says so.",
    icon: "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
  },
  {
    title: "Decide with both fee routes",
    body: "See what a price gap between stores is worth after eBay fees and after Shopify card fees. Then find suppliers and export a draft Shopify listing.",
    icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
  },
];

const PRO_FEATURES = [
  "100 free Amazon UK searches a month",
  "Standard Dossiers for 1 credit instead of 4",
  "The full catalog: every live product we track, ranked",
  "Add any product page and get it scored in seconds",
  "Price gaps after eBay and Shopify fees, every source linked",
  "Profit calculator, supplier search and a Shopify import file",
  "Cancel any time from your account page",
];

const AGENT_FEATURES = [
  "No account and no API key: pay per request with x402",
  "Searches that find nothing are free",
  "MCP server for Claude, Cursor and other agents",
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Is this AI?",
    a: "No. Verdicts and margins are rule-based: fixed formulas applied to cited evidence. The same evidence always gives the same result, and every Dossier lists the evidence behind it.",
  },
  {
    q: "Where do the numbers come from?",
    a: "Amazon UK listings and prices come live from Rainforest API, and supplier prices live from AliExpress's official Drop Shipping API. VAT and duty follow GOV.UK and EU customs rules, and platform fees their published fee schedules, each one linked. Every number keeps its source link, the time it was read and a quality rating. Sales-rank history for Momentum is added once our Keepa connection is live.",
  },
  {
    q: "What does the landed margin include?",
    a: "The Amazon UK selling price, the AliExpress unit cost, import duty and VAT for the UK or an EU market, the selling platform's fees, and the break-even ad cost per sale. Shipping is counted when the supplier quotes it. Anything that can't be sourced is listed as left out, never guessed.",
  },
  {
    q: "What are the two fee routes in the showcase?",
    a: "When two stores sell the same product at different prices, the showcase works out what you'd keep reselling it on eBay, and what you'd keep in your own Shopify shop after card fees. Its prices are captured from the store pages, and each fee rule links to its source. Shipping, VAT and advertising aren't included there.",
  },
  {
    q: "What's a credit?",
    a: "Credits pay for searches and Dossiers. A new account's first Standard Dossier is free. After that, a search costs 1 credit and a Standard Dossier 4, or 1 on Pro, and Pro includes 100 free searches a month. A search that finds nothing, or a Dossier that can't be built, costs nothing. Every Dossier you buy stays in your library, and reopening one is free.",
  },
  {
    q: "Can I cancel?",
    a: `Yes. Pro is ${PRO_PRICE} a month, and you can cancel any time from your account page through Stripe's secure billing portal.`,
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "ProductRadar", url: SITE_URL },
      {
        "@type": "SoftwareApplication",
        name: "ProductRadar",
        url: SITE_URL,
        description: DESCRIPTION,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        publisher: { "@id": `${SITE_URL}/#org` },
        offers: {
          "@type": "Offer",
          name: `ProductRadar ${PLANS.pro.name}`,
          price: (PLANS.pro.pricePence / 100).toFixed(2),
          priceCurrency: "GBP",
        },
      },
    ],
  };

  return (
    <div className="flex-1 bg-background-dark text-slate-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-accent-mint focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-background-dark"
      >
        Skip to content
      </a>
      <Navbar links={SECTIONS} ctaHref={GET_STARTED} />

      <main id="main">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="hero-grid absolute inset-0" />
            <div className="absolute top-[-18rem] left-1/2 h-[36rem] w-[64rem] max-w-[200vw] -translate-x-1/2 rounded-full bg-accent-mint/10 blur-3xl" />
          </div>
          <div className="mx-auto max-w-7xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-20 lg:px-8 lg:pt-28">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/10 ring-inset sm:text-sm">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-mint" />
                  Live Dossier Terminal · Amazon UK and AliExpress
                </p>
                {/* Each phrase wraps as a unit; the smallest phones get a touch less than text-5xl so it fits. */}
                <h1 id="hero-title" className="mt-7 text-[2.6rem] leading-[1.05] font-extrabold tracking-tighter text-balance text-white max-[400px]:text-[2.15rem] sm:text-5xl lg:text-6xl">
                  <span className="inline-block">Institutional-Grade</span>{" "}
                  <span className="inline-block text-accent-mint">E-Commerce Intelligence</span>
                </h1>
                <p className="mt-6 max-w-2xl text-lg/8 text-slate-300 sm:text-xl/8">
                  The Live Dossier Terminal turns an Amazon UK product into an 8-part Dossier, built on demand from live data:
                  the true landed margin after VAT, duty, fees and ads, whether you can legally resell it, the best AliExpress
                  supplier matches, and every number cited. Thin evidence is withheld, never guessed.
                </p>
                {/* The one action: paste a product, get its verdict free. */}
                <PasteBox />
                <p className="mt-6 font-mono text-[11px] tracking-widest text-slate-400 uppercase">
                  UK + EU margins · 8 parts · every number cited · confidence-gated
                </p>
              </div>
              <TiltTerminal>
                <HeroAssembly />
              </TiltTerminal>
            </div>
            <div className="mx-auto mt-16 max-w-5xl">
              <Suspense fallback={<LiveStatsSkeleton />}>
                <HeroStats />
              </Suspense>
            </div>
          </div>
        </section>

        {/* Platform (the v2 engine) */}
        <section id="platform" aria-labelledby="platform-title" className="scroll-mt-16 border-y border-line-dark bg-surface-dark/40 py-16 text-slate-300 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="font-mono text-xs font-semibold tracking-widest text-accent-mint uppercase">The platform</p>
              <h2 id="platform-title" className="mt-2 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
                A research terminal for every product you&apos;re thinking of stocking
              </h2>
              <p className="mt-4 text-lg/8 text-slate-400">
                Search Amazon UK, open a Dossier, and export the winners straight to Shopify. Each part shows only once the
                evidence is strong enough: a verdict from 0.5 confidence, every number from 0.7.
              </p>
            </div>
            <div className="mt-10">
              <Suspense fallback={<PlatformSkeleton />}>
                <Platform />
              </Suspense>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={GET_STARTED} className={`group ${primaryButton}`}>
                Create a free account
                <Arrow />
              </Link>
              <p className="text-sm text-slate-400">Searches cost 1 credit (Pro: 100 free a month). A Dossier is 4 credits, or 1 on Pro.</p>
            </div>
          </div>
        </section>

        {/* Showcase */}
        <section id="showcase" aria-labelledby="showcase-title" className="scroll-mt-16 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className={eyebrow}>Live showcase</p>
              <h2 id="showcase-title" className={`mt-2 ${sectionTitle}`}>
                The margin engine, on real products
              </h2>
              <p className="mt-4 text-lg/8 text-slate-400">
                Real prices captured from real stores. See what the same price gap is worth on eBay and in your own
                shop, after each route&apos;s fees. Click the card for the full dossier.
              </p>
            </div>
            <div className="mt-10">
              <Suspense fallback={<ShowcaseSkeleton />}>
                <ShowcaseContent />
              </Suspense>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 border-y border-line-dark bg-surface-dark/40 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className={eyebrow}>How it works</p>
              <h2 id="how-title" className={`mt-2 ${sectionTitle}`}>
                From store page to decision in three steps
              </h2>
            </div>
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl bg-surface-dark p-6 ring-1 ring-line-dark">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-accent-mint/10 text-accent-mint ring-1 ring-accent-mint/20 ring-inset">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                        <path d={s.icon} />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-slate-400 tabular-nums">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm/6 text-slate-400">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Why it holds up: the three guarantees, as a bento grid */}
        <section id="why" aria-labelledby="why-title" className="scroll-mt-16 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className={eyebrow}>Why it holds up</p>
              <h2 id="why-title" className={`mt-2 ${sectionTitle}`}>
                Numbers you can defend before you buy stock
              </h2>
              <p className="mt-4 text-lg/8 text-slate-400">
                Every Dossier is built the same way, from live sources, with every line cited and nothing estimated to fill a gap.
              </p>
            </div>
            <div className="mt-12">
              <TrustBento />
            </div>
          </div>
        </section>

        {/* For agents */}
        <section id="agents" aria-labelledby="agents-title" className="scroll-mt-16 border-y border-line-dark bg-surface-dark/40 py-16 text-slate-300 sm:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
            <div>
              <p className="text-sm font-semibold text-accent-mint">For buyer agents</p>
              <h2 id="agents-title" className="mt-2 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
                Your agents can buy the same intelligence, one request at a time.
              </h2>
              <p className="mt-4 text-lg/8 text-slate-400">
                Agents call the ProductRadar API and pay a small fee in USDC per request, using the open x402 payment
                standard. Every answer is the same 8-part Dossier, with the same cited evidence, as the Dossier terminal.
              </p>
              <ul className="mt-6 space-y-2">
                {AGENT_FEATURES.map((f) => (
                  <li key={f} className="flex gap-3 text-slate-300">
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-5 shrink-0 text-accent-mint">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/docs"
                className={`group mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-base font-semibold text-background-dark shadow-sm transition hover:bg-slate-200 active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
              >
                Read the API docs
                <Arrow />
              </Link>
            </div>
            <figure className="min-w-0 overflow-hidden rounded-2xl bg-surface-dark ring-1 ring-line-dark">
              <figcaption className="flex items-center gap-2 border-b border-line-dark px-4 py-3 text-xs text-slate-400">
                <span aria-hidden="true" className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-white/15" />
                  <span className="size-2.5 rounded-full bg-white/15" />
                  <span className="size-2.5 rounded-full bg-white/15" />
                </span>
                How an agent pays for one answer
              </figcaption>
              <pre className="overflow-x-auto p-4 font-mono text-[0.8rem]/6 text-slate-300 sm:p-5">
                <code>
                  <span className="text-slate-400"># 1. Ask, without paying</span>
                  {"\n"}
                  <span className="text-sky-300">GET</span> /api/agent/v2/search?q=pizza+oven
                  {"\n"}
                  <span className="text-amber-300">← 402 Payment Required</span> <span className="text-slate-400">(the price, in USDC)</span>
                  {"\n\n"}
                  <span className="text-slate-400"># 2. Sign a USDC payment and ask again</span>
                  {"\n"}
                  <span className="text-sky-300">GET</span> /api/agent/v2/search?q=pizza+oven
                  {"\n"}
                  <span className="text-slate-400">PAYMENT-SIGNATURE:</span> eyJ4NDAyVmVyc2lvbiI6Mi…
                  {"\n"}
                  <span className="text-emerald-300">← 200 OK</span> <span className="text-slate-400">{"{ verdict, landedMargin, evidence… }"}</span>
                </code>
              </pre>
            </figure>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-16 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className={eyebrow}>Pricing</p>
              <h2 id="pricing-title" className={`mt-2 ${sectionTitle}`}>
                One plan for people, pay-per-request for agents
              </h2>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-5">
              <div className="flex flex-col rounded-2xl bg-surface-dark p-6 shadow-xl ring-2 shadow-black/30 ring-accent-mint sm:p-8 lg:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-white">Pro</h3>
                  <span className="rounded-full bg-accent-mint/10 px-2.5 py-1 text-xs font-semibold text-accent-mint ring-1 ring-accent-mint/30 ring-inset">
                    For operators
                  </span>
                </div>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-semibold tracking-tight text-white">{PRO_PRICE}</span>
                  <span className="text-sm text-slate-400">/ month</span>
                </p>
                <ul className="mt-6 space-y-3 text-sm text-slate-300">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={GET_STARTED} className={`group mt-8 w-full ${primaryButton}`}>
                  Create a free account
                  <Arrow />
                </Link>
                <p className="mt-3 text-center text-xs text-slate-400">Free to create · upgrade any time</p>
              </div>
              <div className="flex flex-col rounded-2xl bg-white/[0.03] p-6 ring-1 ring-line-dark sm:p-8 lg:col-span-2">
                <h3 className="text-lg font-semibold text-white">Agent API</h3>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-white">Pay per request</p>
                <p className="mt-1 text-sm text-slate-400">in USDC, with no subscription</p>
                <ul className="mt-6 space-y-3 text-sm text-slate-300">
                  {AGENT_FEATURES.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  <Link href="/docs" className={`w-full ${secondaryButton}`}>
                    See the price in the docs
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 border-y border-line-dark bg-surface-dark/40 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 id="faq-title" className={`text-center ${sectionTitle}`}>
              Questions
            </h2>
            <div className="mt-10 divide-y divide-line-dark overflow-hidden rounded-2xl border border-line-dark bg-surface-dark">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group">
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-white hover:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-mint sm:px-6 [&::-webkit-details-marker]:hidden"
                  >
                    {q}
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180 motion-reduce:transition-none">
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </summary>
                  <p className="px-5 pb-5 text-sm/6 text-slate-400 sm:px-6">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section aria-labelledby="cta-title" className="py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 id="cta-title" className={sectionTitle}>
              Check your next product before you stock it.
            </h2>
            <p className="mt-4 text-lg/8 text-slate-300">
              Real prices, real fees and every source linked. Free to create; Pro is {PRO_PRICE} a month.
            </p>
            <CallToAction className="mt-8" />
          </div>
        </section>
      </main>

    </div>
  );
}
