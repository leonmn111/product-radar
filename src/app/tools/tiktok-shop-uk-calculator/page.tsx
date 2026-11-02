import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { TikTokShopUkCalculator } from "@/components/tools/tiktok-shop-uk-calculator";
import { TIKTOK_UK_REFERRAL_EVIDENCE, UK_VAT_EVIDENCE } from "@/engine/policy";
import { SITE_URL } from "@/lib/site";

// The free TikTok Shop UK calculator: a search landing page for UK sellers working out what they keep after
// TikTok's commission, the self-ship order fee and the creator's commission, and how much they can spend on
// ads per sale. Static; the calculator runs in the browser (engine/tiktokShopUk.ts). Every rate it states is
// cited below it. The one onward action is the homepage check.

const TITLE = "Free TikTok Shop UK Profit & Ad Cost Calculator (2026)";
const DESCRIPTION =
  "Free TikTok Shop UK calculator: your profit per sale after the 9% commission, £0.50 order fee and creator commission, plus your max ad cost to break even.";
const URL = `${SITE_URL}/tools/tiktok-shop-uk-calculator`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "ProductRadar", title: TITLE, description: DESCRIPTION, url: URL, locale: "en_GB" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// Retail Week's report of the UK base commission rising from 5% to 9%; the category rates from the summary
// the margin engine cites (engine/policy.ts).
const RETAIL_WEEK =
  "https://retail-week.com/marketplaces/exclusive-tiktok-shop-is-increasing-seller-fees-in-drive-to-be-marketplace-of-the-future/7046769.article";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const link = `font-medium text-accent-mint underline underline-offset-2 hover:text-accent-mint-strong ${focusRing}`;

const FAQ = [
  {
    q: "What fees does TikTok Shop UK charge sellers?",
    a: "A referral commission on every sale: 9% in most categories, after TikTok raised the UK rate from 5%, and 5% in selected Electronics and Beauty categories. This calculator also counts £0.50 for each order you ship yourself. Rates differ by category and change, so check yours in TikTok Seller Center.",
  },
  {
    q: "How does creator commission work?",
    a: "When an affiliate creator sells your product through their videos or lives, you pay them the commission rate you agreed, as a share of the sale price. This calculator starts at 15%: change it to your own rate, or 0 for sales you make yourself.",
  },
  {
    q: "How much can I spend on ads per sale?",
    a: "Up to your profit per sale before ads. Spend exactly that to win each sale and you break even; spend less and you make money. The calculator also shows your break-even ROAS: how many pounds of sales your ads must bring in for every £1 they cost.",
  },
  {
    q: "Does the calculator include VAT?",
    a: "Only if you tick “I'm VAT-registered”. Then 20% VAT is inside your sale price (a sixth of it goes to HMRC), and TikTok's commission and the creator's are worked out on the price before VAT.",
  },
];

export default function TikTokShopUkCalculatorPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "ProductRadar", url: SITE_URL },
      {
        "@type": "WebApplication",
        name: "TikTok Shop UK profit and ad cost calculator",
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
          Uses TikTok Shop UK&apos;s 9% commission
        </p>
        <h1 className="mt-5 max-w-4xl text-3xl leading-tight font-extrabold tracking-tight text-balance text-white sm:text-5xl">
          TikTok Shop UK Margin Calculator: See what you actually keep.
        </h1>
        <p className="mt-4 max-w-3xl text-lg/8 text-slate-300">
          Free, with no account. Enter your sale price, landed cost and creator commission: your profit after TikTok&apos;s fees, and the most you can
          spend on ads per sale, update as you type.
        </p>

        <div className="mt-10">
          <TikTokShopUkCalculator />
        </div>

        {/* The upsell: the homepage check. */}
        <section aria-labelledby="uk-check-title" className="mt-10 flex flex-col gap-5 rounded-2xl bg-accent-mint/10 p-6 ring-1 ring-accent-mint/30 ring-inset sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <h2 id="uk-check-title" className="max-w-2xl text-xl font-semibold text-balance text-white sm:text-2xl">
            Don&apos;t guess on your next product. Paste your product link and supplier price to get a full UK Pre-order Check.
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
            TikTok Shop UK fees, in brief
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
            Sources:{" "}
            <a href={RETAIL_WEEK} target="_blank" rel="noopener noreferrer" className={link}>
              Retail Week
              <span className="sr-only"> (opens in a new tab)</span>
            </a>{" "}
            on the UK commission rising from 5% to 9%;{" "}
            <a href={TIKTOK_UK_REFERRAL_EVIDENCE.sourceUrl} target="_blank" rel="noopener noreferrer" className={link}>
              OneCart&apos;s TikTok Shop fee guide
              <span className="sr-only"> (opens in a new tab)</span>
            </a>{" "}
            for the 5% Electronics and Beauty rate; the UK VAT rate from{" "}
            <a href={UK_VAT_EVIDENCE.sourceUrl} target="_blank" rel="noopener noreferrer" className={link}>
              GOV.UK
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            . The £0.50 self-ship order fee isn&apos;t on a public TikTok page: check it, and your category&apos;s rate, in TikTok Seller Center.
          </p>
        </section>
      </main>
    </div>
  );
}
