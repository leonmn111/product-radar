import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ContactEmail } from "@/components/legal/LegalPage";
import { Breakdown } from "@/components/landing/paste-box";
import { Navbar } from "@/components/layout/Navbar";
import { db } from "@/lib/db";
import { confirmPreorderCheckout } from "@/server/billing/preorderCheck";
import type { PreorderClaims } from "@/server/billing/preorderPayments";
import { afterPreorderPaid, preorderBreakdown } from "@/services/preorderReport";
import { appUrl } from "@/lib/app-url";
import { SITE_URL } from "@/lib/site";

// /preorder-check/<Stripe Checkout session id>: where Stripe sends a buyer of the £29 Pre-order Check, and the
// check's permanent page (its link is in the receipt email). The session id is long and unguessable, so the
// link is the key. If the webhook hasn't arrived yet, the payment is confirmed straight from Stripe here.

export const metadata: Metadata = {
  title: "Your Pre-order Check — ProductRadar",
  description: "Your paid ProductRadar Pre-order Check.",
  robots: { index: false, follow: false },
};

type Params = Promise<{ sessionId: string }>;

async function CheckContent({ params }: { params: Params }) {
  const { sessionId } = await params;
  await connection();
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) notFound();
  let row = await db.preorderCheck.findUnique({ where: { stripeSessionId: sessionId }, select: { id: true, email: true, asin: true, claims: true, status: true } });
  if (!row) notFound();

  if (row.status !== "PAID") {
    const confirmed = await confirmPreorderCheckout(db, sessionId, new Date()).catch((e) => {
      console.error("[preorder] couldn't confirm with Stripe", sessionId, e);
      return null;
    });
    if (confirmed?.first) await afterPreorderPaid(db, confirmed.check, appUrl(SITE_URL));
    if (confirmed) row = { ...row, status: "PAID" };
  }
  if (row.status !== "PAID") {
    return (
      <div className="rounded-2xl bg-surface-dark p-6 ring-1 ring-line-dark">
        <h1 className="text-2xl font-bold text-white">Waiting for your payment</h1>
        <p className="mt-2 text-sm text-slate-300">
          Stripe hasn&apos;t confirmed this payment yet. Refresh this page in a moment: your Pre-order Check opens as soon as it&apos;s confirmed.
        </p>
      </div>
    );
  }

  const check = { id: row.id, email: row.email, asin: row.asin, claims: row.claims as unknown as PreorderClaims, stripeSessionId: sessionId };
  const breakdown = await preorderBreakdown(db, check).catch(() => null);
  return (
    <div className="rounded-2xl bg-surface-dark p-5 ring-1 ring-line-dark sm:p-6">
      <p className="font-mono text-[11px] tracking-widest text-accent-mint uppercase">Pre-order Check · paid</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-balance text-white">{breakdown?.product.title ?? `Amazon UK product ${row.asin}`}</h1>
      <p className="mt-2 text-sm text-slate-300">
        Paid with {row.email}. We&apos;ve emailed you this page&apos;s link: it stays open, so you can come back to it any time.
      </p>
      {breakdown ? (
        <Breakdown b={breakdown} fullDossier={`/signin?tab=register&callbackUrl=${encodeURIComponent(`/terminal?asin=${row.asin}`)}`} paid />
      ) : (
        <p className="mt-5 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-400/30 ring-inset">
          We couldn&apos;t rebuild this check from today&apos;s data. Email <ContactEmail /> with this page&apos;s link and we&apos;ll fix it or refund you.
        </p>
      )}
    </div>
  );
}

export default function PreorderCheckPage({ params }: { params: Params }) {
  return (
    <div className="flex-1 bg-background-dark text-slate-100">
      <Navbar ctaHref="/#check" ctaLabel="Free check" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <Suspense fallback={<p className="text-sm text-slate-400">Opening your Pre-order Check…</p>}>
          <CheckContent params={params} />
        </Suspense>
      </main>
    </div>
  );
}
