const BENEFITS = [
  "The full catalog: every live product we track, ranked",
  "Paste any product link and get it scored in seconds",
  "Price gaps after eBay and Shopify fees, every source linked",
  "Supplier search and a Shopify import file for each product",
];

/** The Pro offer, shown where a Free account would otherwise see the catalog. */
export function UpgradeCard({ signedIn, liveProducts }: { signedIn: boolean; liveProducts?: number }) {
  return (
    <section
      aria-labelledby="upgrade-title"
      className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5 shadow-sm sm:p-6 dark:border-purple-500/30 dark:from-purple-950/40 dark:to-zinc-900"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h2 id="upgrade-title" className="text-lg font-semibold text-zinc-950 dark:text-white">
            Unlock the full catalog with Pro
          </h2>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            {liveProducts
              ? `Pro opens all ${liveProducts.toLocaleString("en-GB")} live products we track, each with its scores, sourced evidence and both resale fee routes.`
              : "Pro opens every live product we track, each with its scores, sourced evidence and both resale fee routes."}
          </p>
          <ul className="mt-3 grid gap-1.5 text-sm text-zinc-700 sm:grid-cols-2 dark:text-zinc-300">
            {BENEFITS.map((b) => (
              <li key={b} className="flex gap-2">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-4 shrink-0 text-purple-600 dark:text-purple-400">
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
          <p className="text-zinc-950 dark:text-white">
            <span className="text-3xl font-semibold tracking-tight">£39</span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400"> / month</span>
          </p>
          <a
            href="/upgrade"
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 motion-reduce:transition-none dark:bg-purple-500 dark:text-zinc-950 dark:hover:bg-purple-400"
          >
            {signedIn ? "Upgrade to Pro" : "Sign in & upgrade"}
          </a>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Secure checkout by Stripe · cancel any time</p>
        </div>
      </div>
    </section>
  );
}
