const BENEFITS = [
  "Paste any product link and get it scored in seconds",
  "See every live product in the radar, not just sample data",
  "Each score shows its sources, timestamps and confidence",
  "Cancel any time from your billing page",
];

export function UpgradeCard({ signedIn }: { signedIn: boolean }) {
  return (
    <section
      aria-labelledby="upgrade-title"
      className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm dark:border-indigo-500/30 dark:from-indigo-950/40 dark:to-zinc-900"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h2 id="upgrade-title" className="text-base font-semibold text-zinc-950 dark:text-white">
            Analyze live products with Pro
          </h2>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            Free accounts can explore the sample data. Pro unlocks live ingestion and the full product radar.
          </p>
          <ul className="mt-3 grid gap-1.5 text-sm text-zinc-700 sm:grid-cols-2 dark:text-zinc-300">
            {BENEFITS.map((b) => (
              <li key={b} className="flex gap-2">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-4 shrink-0 text-indigo-600 dark:text-indigo-400">
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
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:text-zinc-950 dark:hover:bg-indigo-400"
          >
            {signedIn ? "Upgrade to Pro" : "Sign in & upgrade"}
          </a>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Secure checkout by Stripe</p>
        </div>
      </div>
    </section>
  );
}
