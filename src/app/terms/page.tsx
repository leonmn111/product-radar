import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, Detail, LegalPage, legalLink, type LegalSection } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";
import { balanceGbp, CREDIT_PACKS, creditsGbp, gbp, PLANS, planPriceLabel, STANDARD_DOSSIER_CREDITS } from "@/server/billing/plans";

const DESCRIPTION = "The terms for using ProductRadar: plans, your balance, refunds, third-party data and your rights.";
export const metadata: Metadata = {
  title: "Terms of Service — ProductRadar",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/terms` },
  openGraph: { title: "Terms of Service — ProductRadar", description: DESCRIPTION, url: `${SITE_URL}/terms` },
};

const packs = Object.values(CREDIT_PACKS)
  .map((p) => `${p.name}: pay ${gbp(p.pricePence)}, get ${balanceGbp(p.credits)}`)
  .join("; ");

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          {LEGAL.tradingName} ({LEGAL.website.replace(/^https?:\/\//, "")}) is run by <Detail value={LEGAL.operator} missing="the operator's legal name" />, a
          sole trader based in the United Kingdom. Our address for legal notices is <Detail value={LEGAL.postalAddress} missing="postal address" />, and you can
          email us at <ContactEmail />.
        </p>
        <p>These terms apply when you use the website, an account, or the API. By using ProductRadar you agree to them.</p>
      </>
    ),
  },
  {
    id: "the-service",
    title: "What ProductRadar is",
    body: (
      <>
        <p>
          ProductRadar is a product-research tool. It gathers listings, prices and supplier offers from third-party sources and
          calculates verdicts, margins, trends and other scores from that evidence.
        </p>
        <ul>
          <li>
            <strong>Estimates, not guarantees.</strong> Every score and margin is a calculated estimate from the evidence cited with it. Prices,
            fees and demand change, and sources can be wrong or incomplete.
          </li>
          <li>
            <strong>Not professional advice.</strong> Nothing on ProductRadar is financial, legal, tax or regulatory advice. Resellability
            flags (for example brand, trademark, UKCA or battery checks) point out risks to look into. They are not a clearance to sell.
          </li>
          <li>Parts without enough evidence are withheld rather than guessed, so some products will show incomplete results.</li>
        </ul>
        <p>You decide what to buy and sell, and you are responsible for those decisions.</p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <>
        <p>
          You need an account for most features, and you must be at least 18. Keep your sign-in details safe: you are responsible for
          what happens under your account. Tell us at once if you think someone else has used it.
        </p>
      </>
    ),
  },
  {
    id: "plans-and-payment",
    title: "Plans, your balance and payment",
    body: (
      <>
        <ul>
          <li>
            <strong>Subscriptions.</strong> {PLANS.pro.name} is {planPriceLabel(PLANS.pro)}, including {PLANS.pro.monthly.freeSearches} free searches each billing month. {PLANS.agency.name} is{" "}
            {planPriceLabel(PLANS.agency)}. Subscriptions renew every month until you cancel.
          </li>
          <li>
            <strong>Your balance.</strong> Searches and Dossiers are paid from a prepaid balance in pounds. A search costs {creditsGbp(1)}, and a Standard
            Dossier costs {creditsGbp(STANDARD_DOSSIER_CREDITS.FREE)} ({creditsGbp(STANDARD_DOSSIER_CREDITS.PRO)} on Pro or Agency). {PLANS.agency.name} adds{" "}
            {balanceGbp(PLANS.agency.monthly.credits ?? 0)} to your balance each month. Top-ups: {packs}. Your balance can only be spent on ProductRadar: it has no cash
            value and can&apos;t be transferred.
          </li>
          <li>
            <strong>Agents.</strong> The agent API is paid per request in USDC using the x402 standard, at the price shown in the request&apos;s payment
            terms and in the <Link href="/docs" className={legalLink}>API docs</Link>.
          </li>
        </ul>
        <p>
          Card payments are taken by Stripe; we never see your full card details. Prices are in pounds sterling and are shown before you
          pay. We may change prices for future periods and will tell subscribers before a change applies to them.
        </p>
      </>
    ),
  },
  {
    id: "refunds",
    title: "Refunds and cancellation",
    body: (
      <>
        <ul>
          <li>
            <strong>Balance you&apos;ve spent is non-refundable.</strong> A search that finds nothing, or a Dossier that can&apos;t be built, goes back to
            your balance automatically.
          </li>
          <li>
            <strong>Unused balance.</strong> You can ask for a refund of a top-up within 14 days of buying it, for the part you haven&apos;t spent.
          </li>
          <li>
            <strong>Subscriptions.</strong> Cancel any time from your account page. You keep access until the end of the month you&apos;ve paid for, and we
            don&apos;t refund part-months. If you&apos;re a consumer, you can cancel a new subscription within 14 days of starting it and get a refund, less a
            fair amount for what you used.
          </li>
          <li>
            <strong>Agent payments</strong> in USDC settle on a public blockchain and can&apos;t be reversed. A request that fails, or finds nothing to
            return, isn&apos;t charged.
          </li>
        </ul>
        <p>
          To ask for a refund, email <ContactEmail /> from your account&apos;s email address. Nothing in these terms affects your statutory rights as a
          consumer.
        </p>
      </>
    ),
  },
  {
    id: "third-party-data",
    title: "Third-party data",
    body: (
      <>
        <p>ProductRadar is built on data from other services, obtained through their official APIs or licensed providers and used within their terms:</p>
        <ul>
          <li>Amazon listings and product pages, through the Rainforest API;</li>
          <li>Amazon price and sales-rank history, through Keepa;</li>
          <li>Supplier listings, through the AliExpress Open Platform (Drop Shipping) API;</li>
          <li>Search interest, from Google Trends through SerpApi.</li>
        </ul>
        <p>
          This data is provided as it comes: it can be delayed, incomplete or wrong, and a source can stop being available. ProductRadar is not
          affiliated with, endorsed by or sponsored by Amazon, AliExpress, Keepa, Google or any brand shown. All trade marks belong to their
          owners.
        </p>
        <p>
          Supplier links go to the supplier&apos;s own listing. We don&apos;t currently earn a commission on them; if that changes, those links will be labelled.
          When you act on any listing, you must follow that platform&apos;s own terms.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You must not:</p>
        <ul>
          <li>copy, scrape, resell or republish ProductRadar&apos;s data or Dossiers in bulk, or use them to build a competing service;</li>
          <li>get around payments, credit checks, rate limits or other technical limits, or reverse-engineer the service;</li>
          <li>share your account, or use ProductRadar unlawfully or to harm others.</li>
        </ul>
        <p>Using the agent API within its documented terms is fine.</p>
      </>
    ),
  },
  {
    id: "exports",
    title: "Exports and your listings",
    body: (
      <p>
        Exports (such as the Shopify product file) are drafts for you to review. Before you sell anything, you are responsible for your listings,
        including the images and descriptions you add, trade marks, product safety and labelling rules (such as UKCA marking), VAT and any platform
        rules.
      </p>
    ),
  },
  {
    id: "ip",
    title: "Our content",
    body: (
      <p>
        ProductRadar&apos;s software, design, scoring rules and text belong to us. You may use what you see and export for your own business research and
        listings. Third-party content stays its owners&apos; property.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes to the service",
    body: (
      <p>
        We work to keep ProductRadar available, but it may be interrupted for maintenance or because a third-party source fails. We may
        change or remove features; if a change takes away something you&apos;ve paid for,
        we&apos;ll offer a fair refund.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Our liability",
    body: (
      <>
        <p>
          Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that
          can&apos;t be limited by law.
        </p>
        <p>
          Otherwise, we aren&apos;t liable for losses that weren&apos;t reasonably foreseeable, or for business losses such as lost profit, lost sales or the
          cost of stock you buy. Our total liability to you is limited to what you paid us in the 12 months before the claim.
        </p>
      </>
    ),
  },
  {
    id: "ending",
    title: "Suspension and closing your account",
    body: (
      <p>
        You can stop using ProductRadar and ask us to close your account at any time. We may suspend or close an account that breaks these terms;
        unless the breach is serious, we&apos;ll tell you first and give you a chance to put it right. If we close an account without cause, we&apos;ll refund your unused
        balance.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms. The date at the top shows when they last changed, and we&apos;ll email account holders about important changes before
        they apply.
      </p>
    ),
  },
  {
    id: "law",
    title: "Law and disputes",
    body: (
      <p>
        These terms are governed by the law of England and Wales, and disputes go to the courts of England and Wales. If you&apos;re a consumer living in
        Scotland or Northern Ireland, you may also bring a claim in your local courts. Please contact us first: most problems can be sorted out
        quickly.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      kind="Terms of Service"
      title="Terms of Service"
      intro={<p>These terms explain what ProductRadar does, what you pay for, how refunds work and the responsibilities on both sides.</p>}
      sections={SECTIONS}
      related={{ href: "/privacy", label: "Privacy Policy" }}
    />
  );
}
