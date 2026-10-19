import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, Detail, LegalPage, legalLink, type LegalSection } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

const DESCRIPTION = "How ProductRadar collects, uses and protects your personal data under UK GDPR.";
export const metadata: Metadata = {
  title: "Privacy Policy — ProductRadar",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/privacy` },
  openGraph: { title: "Privacy Policy — ProductRadar", description: DESCRIPTION, url: `${SITE_URL}/privacy` },
};

// Every statement here describes what the code actually does (checked 19 October 2026). Change it
// when the data handling changes.
const SECTIONS: LegalSection[] = [
  {
    id: "controller",
    title: "Who looks after your data",
    body: (
      <p>
        <Detail value={LEGAL.operator} missing="the operator's legal name" /> runs {LEGAL.tradingName} and is the controller of your personal data under UK
        GDPR and the Data Protection Act 2018. Contact: <ContactEmail />, or <Detail value={LEGAL.postalAddress} missing="postal address" />.
        {LEGAL.icoRegistration ? ` ICO registration: ${LEGAL.icoRegistration}.` : ""}
      </p>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <ul>
        <li>
          <strong>Your account:</strong> your email address and, if you set one, your password, stored only as a one-way hash (bcrypt) that can&apos;t be turned
          back into the password.
        </li>
        <li>
          <strong>Your plan and purchases:</strong> your plan, its renewal date, your Stripe customer reference, your credit balance and a record of every
          credit purchase, spend and refund, the Dossiers you&apos;ve bought and any bulk uploads (the product IDs in them).
        </li>
        <li>
          <strong>Searches:</strong> we count how many searches you run, to apply Pro&apos;s free allowance. We don&apos;t store what you searched for.
        </li>
        <li>
          <strong>Card payments:</strong> handled entirely by Stripe. We never see or store your full card number.
        </li>
        <li>
          <strong>Agent payments (USDC):</strong> the paying wallet&apos;s address, the amount and the transaction reference. These are also public on the
          blockchain by design.
        </li>
        <li>
          <strong>Emails we send you:</strong> sign-in links, password resets, receipts and bulk-job alerts.
        </li>
        <li>
          <strong>Technical data:</strong> our host&apos;s server logs can include your IP address and browser details, used to keep the service running and
          secure.
        </li>
      </ul>
    ),
  },
  {
    id: "why",
    title: "Why we use it, and our lawful basis",
    body: (
      <ul>
        <li>
          <strong>To provide the service you signed up for</strong> (your account, plan, credits, Dossiers, receipts): <em>contract</em>.
        </li>
        <li>
          <strong>To keep ProductRadar secure</strong> and prevent fraud and abuse: <em>legitimate interests</em>.
        </li>
        <li>
          <strong>To understand overall use of the site</strong> through privacy-friendly, aggregate statistics: <em>legitimate interests</em>.
        </li>
        <li>
          <strong>To keep financial records</strong> as UK tax law requires: <em>legal obligation</em>.
        </li>
      </ul>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p>We use these service providers (processors), each only for the job listed:</p>
        <ul>
          <li>
            <strong>Railway</strong>: hosting and our database, located in Amsterdam, the Netherlands.
          </li>
          <li>
            <strong>Stripe</strong>: card payments, subscriptions and billing.
          </li>
          <li>
            <strong>Resend</strong>: delivering our emails.
          </li>
          <li>
            <strong>Coinbase Developer Platform</strong>: verifying and settling agent payments in USDC.
          </li>
          <li>
            <strong>Plausible Analytics</strong>: website statistics without cookies or personal data.
          </li>
        </ul>
        <p>
          Our data sources (Rainforest API, Keepa, AliExpress and SerpApi) receive only product searches and product IDs, never your personal details.
          We don&apos;t sell your data, and we don&apos;t use advertising trackers.
        </p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "International transfers",
    body: (
      <p>
        Some of these providers are based in the United States. Where your data leaves the UK, it&apos;s protected by the safeguards UK law requires, such as
        the UK International Data Transfer Agreement or Addendum, or the UK Extension to the EU-US Data Privacy Framework.
      </p>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <ul>
        <li>Every connection is encrypted (HTTPS), and the database isn&apos;t reachable from the internet.</li>
        <li>Passwords are stored only as hashes, and password-reset links work once and expire within an hour.</li>
        <li>Your sign-in is a signed, HttpOnly cookie that scripts on the page can&apos;t read.</li>
        <li>Card data never touches our servers.</li>
      </ul>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Your account, its Dossiers and credit history: until you ask us to close your account.</li>
        <li>Purchase and payment records: six years, as UK tax law requires, even after an account closes.</li>
        <li>Server logs: kept briefly by our host for security, then deleted.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>
          Under UK GDPR you can ask to see the personal data we hold about you, correct it, delete it, restrict or object to how we use it, or receive it
          in a portable format. Email <ContactEmail /> from your account&apos;s address and we&apos;ll reply within one month. To close your account and delete its
          data, email us too.
        </p>
        <p>
          If you&apos;re unhappy with how we handle your data, you can complain to the Information Commissioner&apos;s Office at{" "}
          <a href="https://ico.org.uk/make-a-complaint/" className={legalLink} rel="noopener noreferrer" target="_blank">
            ico.org.uk
          </a>{" "}
          or on 0303 123 1113. We&apos;d appreciate the chance to put things right first.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        We only use cookies that are essential: the one that keeps you signed in, and short-lived security cookies set by our sign-in system. Your
        light or dark theme choice is saved in your own browser (local storage), not sent to us. Plausible measures visits without cookies. There are no
        advertising or tracking cookies, so there&apos;s nothing to opt out of.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>ProductRadar is a business tool for adults and isn&apos;t meant for anyone under 18.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We&apos;ll update this policy when our data handling changes. The date at the top shows the latest version, and we&apos;ll email account holders about
        important changes. See also our <Link href="/terms" className={legalLink}>Terms of Service</Link>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      kind="Privacy Policy"
      title="Privacy Policy"
      intro={<p>This policy explains what personal data ProductRadar collects, why, who processes it, and the rights you have over it.</p>}
      sections={SECTIONS}
      related={{ href: "/terms", label: "Terms of Service" }}
    />
  );
}
