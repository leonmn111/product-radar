import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LiveStats, LiveStatsSkeleton } from "@/components/landing/live-stats";
import { Showcase } from "@/components/landing/showcase";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SITE_URL } from "@/lib/site";
import { PRO_PLAN } from "@/server/billing/stripe";
import { getShowcase } from "@/server/products/showcase-cache";

// The public landing page. Signed-in visitors never see it: src/proxy.ts sends them
// to /dashboard. Everything here is static except the live counts and the showcase,
// which stream in from the database (cached for about an hour).

const TITLE = "ProductRadar — Evidence-backed product research for e-commerce";
const DESCRIPTION =
  "Score products from sourced, timestamped evidence and see real price gaps between stores after eBay and Shopify fees. For e-commerce operators and buyer agents.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "ProductRadar", title: TITLE, description: DESCRIPTION, url: SITE_URL, locale: "en_GB" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// Sign up, then the dashboard: a Free account sees the Pro offer and the showcase there, and
// upgrades when it wants to. No callbackUrl, so sign-in falls back to /dashboard.
const GET_STARTED = "/signin?tab=register";
const PRO_PRICE = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: PRO_PLAN.currency.toUpperCase(),
  minimumFractionDigits: 0,
}).format(PRO_PLAN.unitAmount / 100);

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";
// Rich purple with white text passes WCAG AA in both themes; it glows and grows on hover.
const primaryButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg ring-1 shadow-purple-600/30 ring-white/15 transition duration-200 ease-out ring-inset hover:scale-[1.03] hover:bg-purple-700 hover:shadow-xl hover:shadow-purple-600/40 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 dark:shadow-purple-500/20 dark:hover:bg-purple-600 dark:hover:shadow-purple-500/40 ${focusRing}`;
const secondaryButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-300 transition ring-inset hover:bg-zinc-50 active:scale-[0.98] motion-reduce:transition-none dark:bg-white/5 dark:text-zinc-50 dark:ring-white/15 dark:hover:bg-white/10 ${focusRing}`;
const sectionTitle = "text-3xl font-bold tracking-tight text-balance text-zinc-950 sm:text-4xl dark:text-zinc-50";
const eyebrow = "text-sm font-semibold text-purple-700 dark:text-purple-300";
const navLink = `rounded-md px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white ${focusRing}`;

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
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-5 shrink-0 text-purple-600 dark:text-purple-400">
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
        Get started
        <Arrow />
      </Link>
      <Link href="/signin" className={secondaryButton}>
        Sign in
      </Link>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

const NAV = [
  ["#showcase", "Showcase"],
  ["#how-it-works", "How it works"],
  ["#agents", "For agents"],
  ["#pricing", "Pricing"],
] as const;

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className={`flex items-center gap-2.5 rounded-md font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 ${focusRing}`}>
          <Logo />
          ProductRadar
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} className={navLink}>
              {label}
            </a>
          ))}
          <Link href="/docs" className={navLink}>
            API docs
          </Link>
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {/* On narrow phones the hero's full-width Sign in button sits right below. */}
          <Link href="/signin" className={`max-[420px]:hidden ${navLink}`}>
            Sign in
          </Link>
          <Link
            href={GET_STARTED}
            className={`rounded-lg bg-purple-600 px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-md shadow-purple-600/25 transition duration-200 hover:scale-[1.03] hover:bg-purple-700 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 dark:hover:bg-purple-600 dark:hover:shadow-purple-500/40 ${focusRing}`}
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── Streamed sections ────────────────────────────────────────────────────────

async function HeroStats() {
  await connection(); // per request (cached ~1h), never during the build
  const { stats } = await getShowcase();
  return <LiveStats stats={stats} />;
}

async function ShowcaseContent() {
  await connection();
  const { products } = await getShowcase();
  if (products.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        No two stores are selling the same product at different prices right now, so there&apos;s no live price gap to
        show. Pro members see the full catalog either way.
      </p>
    );
  }
  return <Showcase products={products} />;
}

function ShowcaseSkeleton() {
  const block = "animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5";
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

const TRUST = [
  ["Rule-based, not a black box", "Scores come from fixed formulas over captured evidence. The same evidence always gives the same score."],
  ["Public benchmarks you can check", "Wholesale ranges come from US Census retail margins, and every fee rule links to its published source."],
  ["Estimates, clearly labelled", "Every score shows how confident it is. Nothing is padded to look certain, and nothing is a guarantee."],
] as const;

const PRO_FEATURES = [
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
    a: "No. Scores are rule-based estimates: fixed formulas applied to evidence captured from real pages. The same evidence always gives the same result, and every dossier lists the evidence behind it.",
  },
  {
    q: "Where do the numbers come from?",
    a: "Prices, ratings and review counts come from store and review pages, each saved with its link, the time it was read and a quality rating. Search interest comes from Google Trends. The wholesale range comes from US Census retail gross margins for the kind of shop that sells the product.",
  },
  {
    q: "What are the two fee routes?",
    a: "When two stores sell the same product at different prices, ProductRadar works out what you'd keep reselling it on eBay, and what you'd keep in your own Shopify shop after card fees. Each fee rule links to its source. Shipping, VAT and advertising aren't included.",
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
          name: PRO_PLAN.productName,
          price: (PRO_PLAN.unitAmount / 100).toFixed(2),
          priceCurrency: PRO_PLAN.currency.toUpperCase(),
        },
      },
    ],
  };

  return (
    <div className="flex-1 bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-purple-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="hero-grid absolute inset-0" />
            <div className="absolute top-[-16rem] left-1/2 h-[34rem] w-[60rem] max-w-[200vw] -translate-x-1/2 rounded-full bg-purple-400/25 blur-3xl dark:bg-purple-600/20" />
          </div>
          <div className="mx-auto max-w-7xl px-4 pt-16 pb-16 sm:px-6 sm:pt-24 sm:pb-20 lg:px-8 lg:pt-32">
            <div className="mx-auto max-w-4xl text-center">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 backdrop-blur ring-inset sm:text-sm dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
                Product intelligence for e-commerce operators and buyer agents
              </p>
              {/* Each sentence wraps as a unit; the smallest phones get a touch less than text-5xl so it fits. */}
              <h1 className="mt-8 text-5xl leading-[1.05] font-extrabold tracking-tighter text-zinc-950 max-[400px]:text-[2.75rem] md:text-7xl dark:text-zinc-50">
                <span className="inline-block">Find the spread.</span> <span className="inline-block">Ignore the noise.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-balance text-zinc-600 sm:text-xl/8 dark:text-zinc-400">
                Rule-based product intelligence and dual-margin analytics for serious{" "}
                <span className="whitespace-nowrap">e-commerce</span> operators.
              </p>
              <CallToAction className="mt-10" />
              <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-400">
                Pro is {PRO_PRICE}/month · cancel any time · secure checkout by Stripe
              </p>
            </div>
            <div className="mx-auto mt-14 max-w-5xl">
              <Suspense fallback={<LiveStatsSkeleton />}>
                <HeroStats />
              </Suspense>
            </div>
          </div>
        </section>

        {/* Showcase */}
        <section id="showcase" aria-labelledby="showcase-title" className="scroll-mt-16 border-t border-zinc-200 bg-zinc-50 py-16 sm:py-24 dark:border-white/10 dark:bg-zinc-950">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className={eyebrow}>Live showcase</p>
              <h2 id="showcase-title" className={`mt-2 ${sectionTitle}`}>
                The margin engine, on real products
              </h2>
              <p className="mt-4 text-lg/8 text-zinc-600 dark:text-zinc-400">
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
        <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 border-t border-zinc-200 bg-white py-16 sm:py-20 dark:border-white/10 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className={eyebrow}>How it works</p>
              <h2 id="how-title" className={`mt-2 ${sectionTitle}`}>
                From store page to decision in three steps
              </h2>
            </div>
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-purple-50 text-purple-700 ring-1 ring-purple-600/10 ring-inset dark:bg-purple-950/60 dark:text-purple-300 dark:ring-purple-400/20">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                        <path d={s.icon} />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-zinc-500 tabular-nums dark:text-zinc-400">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-zinc-950 dark:text-white">{s.title}</h3>
                  <p className="mt-2 text-sm/6 text-zinc-600 dark:text-zinc-400">{s.body}</p>
                </li>
              ))}
            </ol>
            <dl className="mt-12 grid gap-x-8 gap-y-6 border-t border-zinc-200 pt-10 md:grid-cols-3 dark:border-white/10">
              {TRUST.map(([title, body]) => (
                <div key={title} className="flex gap-3">
                  <Check />
                  <div>
                    <dt className="font-semibold text-zinc-950 dark:text-white">{title}</dt>
                    <dd className="mt-1 text-sm/6 text-zinc-600 dark:text-zinc-400">{body}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* For agents */}
        <section id="agents" aria-labelledby="agents-title" className="scroll-mt-16 bg-zinc-950 py-16 text-zinc-300 sm:py-20 [color-scheme:dark] dark:border-y dark:border-white/10 dark:bg-black">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
            <div>
              <p className="text-sm font-semibold text-purple-300">For buyer agents</p>
              <h2 id="agents-title" className="mt-2 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
                Your agents can buy the same intelligence, one request at a time.
              </h2>
              <p className="mt-4 text-lg/8 text-zinc-400">
                Agents call the ProductRadar API and pay a small fee in USDC per request, using the open x402 payment
                standard. Every answer carries the same scores, margins and cited evidence as the dashboard.
              </p>
              <ul className="mt-6 space-y-2">
                {AGENT_FEATURES.map((f) => (
                  <li key={f} className="flex gap-3 text-zinc-300">
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-5 shrink-0 text-purple-400">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/docs"
                className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 motion-reduce:transition-none"
              >
                Read the API docs
                <Arrow />
              </Link>
            </div>
            <figure className="min-w-0 overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10">
              <figcaption className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-xs text-zinc-400">
                <span aria-hidden="true" className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-zinc-700" />
                  <span className="size-2.5 rounded-full bg-zinc-700" />
                  <span className="size-2.5 rounded-full bg-zinc-700" />
                </span>
                How an agent pays for one answer
              </figcaption>
              <pre className="overflow-x-auto p-4 font-mono text-[0.8rem]/6 text-zinc-300 sm:p-5">
                <code>
                  <span className="text-zinc-500"># 1. Ask, without paying</span>
                  {"\n"}
                  <span className="text-sky-300">GET</span> /api/agent/v1/opportunity?q=pizza+oven
                  {"\n"}
                  <span className="text-amber-300">← 402 Payment Required</span> <span className="text-zinc-500">(the price, in USDC)</span>
                  {"\n\n"}
                  <span className="text-zinc-500"># 2. Sign a USDC payment and ask again</span>
                  {"\n"}
                  <span className="text-sky-300">GET</span> /api/agent/v1/opportunity?q=pizza+oven
                  {"\n"}
                  <span className="text-zinc-400">PAYMENT-SIGNATURE:</span> eyJ4NDAyVmVyc2lvbiI6Mi…
                  {"\n"}
                  <span className="text-emerald-300">← 200 OK</span> <span className="text-zinc-500">{"{ verdict, margin, evidence… }"}</span>
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
              <div className="flex flex-col rounded-2xl bg-white p-6 shadow-xl ring-2 shadow-purple-900/10 ring-purple-600 sm:p-8 lg:col-span-3 dark:bg-zinc-900 dark:shadow-black/30 dark:ring-purple-400">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">Pro</h3>
                  <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-600/20 ring-inset dark:bg-purple-950/60 dark:text-purple-300 dark:ring-purple-400/30">
                    For operators
                  </span>
                </div>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-semibold tracking-tight text-zinc-950 dark:text-white">{PRO_PRICE}</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">/ month</span>
                </p>
                <ul className="mt-6 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={GET_STARTED} className={`group mt-8 w-full ${primaryButton}`}>
                  Get started
                  <Arrow />
                </Link>
                <p className="mt-3 text-center text-xs text-zinc-600 dark:text-zinc-400">Free to create · upgrade any time</p>
              </div>
              <div className="flex flex-col rounded-2xl bg-zinc-50 p-6 ring-1 ring-zinc-200 sm:p-8 lg:col-span-2 dark:bg-white/[0.03] dark:ring-white/10">
                <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">Agent API</h3>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">Pay per request</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">in USDC, with no subscription</p>
                <ul className="mt-6 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
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
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 border-t border-zinc-200 bg-zinc-50 py-16 sm:py-20 dark:border-white/10 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 id="faq-title" className={`text-center ${sectionTitle}`}>
              Questions
            </h2>
            <div className="mt-10 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-zinc-900">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group">
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-zinc-950 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-purple-600 sm:px-6 dark:text-white dark:hover:bg-zinc-800/50 dark:focus-visible:outline-purple-400 [&::-webkit-details-marker]:hidden"
                  >
                    {q}
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5 shrink-0 text-zinc-500 transition-transform group-open:rotate-180 motion-reduce:transition-none">
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </summary>
                  <p className="px-5 pb-5 text-sm/6 text-zinc-600 sm:px-6 dark:text-zinc-400">{a}</p>
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
            <p className="mt-4 text-lg/8 text-zinc-600 dark:text-zinc-300">
              Real prices, real fees and every source linked, for {PRO_PRICE} a month.
            </p>
            <CallToAction className="mt-8" />
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 dark:border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 dark:text-zinc-400">
          <p className="flex items-center gap-2 font-medium text-zinc-950 dark:text-white">
            <Logo />
            ProductRadar
          </p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/docs" className={`rounded-sm hover:text-zinc-950 dark:hover:text-white ${focusRing}`}>
              API docs
            </Link>
            <Link href="/signin" className={`rounded-sm hover:text-zinc-950 dark:hover:text-white ${focusRing}`}>
              Sign in
            </Link>
            <Link href={GET_STARTED} className={`rounded-sm hover:text-zinc-950 dark:hover:text-white ${focusRing}`}>
              Get started
            </Link>
          </nav>
        </div>
        <p className="mx-auto max-w-7xl px-4 pb-8 text-xs text-zinc-500 sm:px-6 lg:px-8 dark:text-zinc-400">
          Scores and margins are calculated estimates from cited evidence, not guarantees.
        </p>
      </footer>
    </div>
  );
}
