import { creditsGbp, gbp, PLANS, STANDARD_DOSSIER_CREDITS } from "@/server/billing/plans";

const PRO_DOSSIER = creditsGbp(STANDARD_DOSSIER_CREDITS.PRO);
const BENEFITS = [
  `Dossiers for ${PRO_DOSSIER} instead of ${creditsGbp(STANDARD_DOSSIER_CREDITS.FREE)}`,
  `${PLANS.pro.monthly.freeSearches} free Amazon UK searches a month`,
  "Profit calculator and supplier search",
  "A Shopify import file for each product",
];

/** The Pro offer, in £, shown where a Free account reaches a Pro-only page. */
export function UpgradeCard({ signedIn }: { signedIn: boolean }) {
  return (
    <section
      aria-labelledby="upgrade-title"
      className="rounded-xl border border-accent-mint/30 bg-gradient-to-br from-accent-mint/10 to-white p-5 shadow-sm sm:p-6 dark:to-surface-dark"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h2 id="upgrade-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            Pro: every Dossier for {PRO_DOSSIER}
          </h2>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            Check more products for less, with every UK fee, creator cut and VAT line sourced.
          </p>
          <ul className="mt-3 grid gap-1.5 text-sm text-slate-700 sm:grid-cols-2 dark:text-slate-300">
            {BENEFITS.map((b) => (
              <li key={b} className="flex gap-2">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-4 shrink-0 text-accent-mint">
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
          <p className="text-slate-900 dark:text-white">
            <span className="text-3xl font-semibold tracking-tight">{gbp(PLANS.pro.pricePence)}</span>
            <span className="text-sm text-slate-600 dark:text-slate-400"> / month</span>
          </p>
          <a
            href="/upgrade"
            className="rounded-md bg-accent-mint px-4 py-2 text-sm font-semibold text-on-accent shadow-sm transition hover:bg-accent-mint-strong active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint motion-reduce:transition-none"
          >
            {signedIn ? "Upgrade to Pro" : "Sign in & upgrade"}
          </a>
          <p className="text-xs text-slate-600 dark:text-slate-400">Secure checkout by Stripe · cancel any time</p>
        </div>
      </div>
    </section>
  );
}
