import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import type { SubscriptionTier } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getAccountProfile, type AccountProfile } from "@/server/auth/account";
import { getViewer } from "@/server/auth/entitlements";
import { PLANS, planPriceLabel } from "@/server/billing/plans";
import { getBillingSummary, type BillingSummary } from "@/server/billing/summary";
import { ManageBillingButton } from "./billing-button";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "Account — ProductRadar",
  description: "Your ProductRadar profile, plan, billing and password.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";
const card = "rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900";
const cardTitle = "text-base font-semibold text-zinc-950 dark:text-white";
const muted = "text-sm text-zinc-600 dark:text-zinc-400";

const TIER_LABEL: Record<SubscriptionTier, string> = { FREE: "Free", PRO: "Pro", AGENCY: "Agency" };
const longDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(d);
const proPrice = planPriceLabel(PLANS.pro);

function TierBadge({ tier }: { tier: SubscriptionTier }) {
  const paid = tier !== "FREE";
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        paid
          ? "bg-purple-50 text-purple-800 ring-purple-600/20 dark:bg-purple-950/40 dark:text-purple-300 dark:ring-purple-400/30"
          : "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20"
      }`}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="text-sm text-zinc-950 sm:col-span-2 dark:text-zinc-100">{children}</dd>
    </div>
  );
}

function ProfileCard({ profile, tier }: { profile: AccountProfile; tier: SubscriptionTier }) {
  return (
    <section aria-labelledby="profile-heading" className={card}>
      <h2 id="profile-heading" className={cardTitle}>
        Profile
      </h2>
      <dl className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
        <Row label="Email">
          <span className="break-all">{profile.email}</span>
          {profile.emailVerified && <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">Verified</span>}
        </Row>
        <Row label="Plan">
          <TierBadge tier={tier} />
        </Row>
        <Row label="Sign-in">{profile.hasPassword ? "Email link or password" : "Email link"}</Row>
        <Row label="Member since">{longDate(profile.memberSince)}</Row>
      </dl>
    </section>
  );
}

/** One line about where the subscription stands, from the billing module's view of it. */
function planStatus(tier: SubscriptionTier, b: BillingSummary): { text: string; tone: "ok" | "warn" | "plain" } {
  if (tier === "FREE") {
    return b.status === "CANCELED"
      ? { text: "Your Pro plan has ended. You're on the Free plan, which shows sample products only.", tone: "plain" }
      : { text: "You're on the Free plan, which shows sample products only.", tone: "plain" };
  }
  const end = b.currentPeriodEnd ? longDate(b.currentPeriodEnd) : null;
  if (b.status === "PAST_DUE") return { text: "Your last payment didn't go through. Update your card to keep Pro.", tone: "warn" };
  if (b.cancelAtPeriodEnd && end) return { text: `Cancelled: you keep ${TIER_LABEL[tier]} until ${end}, then move to Free.`, tone: "warn" };
  if (b.status === "TRIALING" && end) return { text: `Free trial: your first payment is on ${end}.`, tone: "ok" };
  if (end) return { text: `Active · renews on ${end} at ${proPrice}.`, tone: "ok" };
  return { text: `Your ${TIER_LABEL[tier]} plan is active.`, tone: "ok" };
}

const TONE = {
  ok: "text-zinc-800 dark:text-zinc-200",
  warn: "rounded-md bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-400/30",
  plain: "text-zinc-800 dark:text-zinc-200",
};

function PlanCard({ tier, billing }: { tier: SubscriptionTier; billing: BillingSummary }) {
  const paid = tier !== "FREE";
  const status = planStatus(tier, billing);
  return (
    <section id="billing" aria-labelledby="billing-heading" className={`${card} scroll-mt-6`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="billing-heading" className={cardTitle}>
          Plan &amp; billing
        </h2>
        <TierBadge tier={tier} />
      </div>
      <p className={`mt-3 text-sm ${TONE[status.tone]}`}>{status.text}</p>

      {!paid && (
        <div className="mt-4 rounded-lg bg-purple-50 p-4 ring-1 ring-purple-200 ring-inset dark:bg-purple-950/40 dark:ring-purple-500/30">
          <p className="text-sm font-semibold text-zinc-950 dark:text-white">Pro unlocks everything ProductRadar tracks</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>Every live product, not just the samples</li>
            <li>Analyze any product link yourself</li>
            <li>Supplier search and one-click Shopify export</li>
          </ul>
          <a
            href="/upgrade"
            className={`mt-4 inline-flex w-full items-center justify-center rounded-md bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 sm:w-auto dark:hover:bg-purple-700 ${focusRing}`}
          >
            Upgrade to Pro · {proPrice}
          </a>
        </div>
      )}

      {billing.hasBillingAccount && (
        <div className="mt-4">
          <ManageBillingButton label="Manage Subscription & Billing" variant={paid ? "primary" : "secondary"} />
          <p className={`mt-2 ${muted}`}>Update your card, download invoices or cancel, on Stripe&apos;s secure page.</p>
        </div>
      )}
    </section>
  );
}

function PasswordCard({ profile }: { profile: AccountProfile }) {
  return (
    <section id="password" aria-labelledby="password-heading" className={`${card} scroll-mt-6`}>
      <h2 id="password-heading" className={cardTitle}>
        {profile.hasPassword ? "Change password" : "Set a password"}
      </h2>
      <p className={`mt-1 mb-4 ${muted}`}>
        {profile.hasPassword
          ? "Change the password you sign in with."
          : "You sign in with email links. Add a password to sign in without waiting for an email. Email links keep working, and nobody gets signed out."}
      </p>
      <PasswordForm email={profile.email} hasPassword={profile.hasPassword} />
    </section>
  );
}

async function AccountContent({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?callbackUrl=%2Faccount");
  const [profile, billing, params] = await Promise.all([getAccountProfile(db, viewer.id), getBillingSummary(db, viewer.id), searchParams]);
  if (!profile) redirect("/signin?callbackUrl=%2Faccount");

  return (
    <div className="space-y-6">
      {params.password === "changed" && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-400/30"
        >
          Password changed. Every other device has been signed out; you&apos;re still signed in here.
        </p>
      )}
      {params.checkout === "credits" && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-400/30"
        >
          Payment received. Your credits are added as soon as Stripe confirms it, usually within seconds: the balance is at the top of the page.
        </p>
      )}
      {params.checkout === "cancelled" && (
        <p role="status" className="rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700 ring-1 ring-zinc-300 ring-inset dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10">
          Checkout cancelled. Nothing was charged.
        </p>
      )}
      <ProfileCard profile={profile} tier={viewer.tier} />
      <PlanCard tier={viewer.tier} billing={billing} />
      <PasswordCard profile={profile} />
    </div>
  );
}

export default function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">Account</h1>
        <Suspense
          fallback={
            <div aria-hidden="true" className="space-y-6">
              <div className="h-56 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
              <div className="h-40 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
              <div className="h-64 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
            </div>
          }
        >
          <AccountContent searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
