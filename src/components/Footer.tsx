// The site-wide footer (rendered by the root layout on every page): the legal links, quiet and
// small, plus the reminder that scores are estimates. Midnight on the public site; white after a signed-in
// app page (the `after-app` variant), so the light app keeps one dark band only: its top bar.

import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const LINKS = [
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
  ["/docs", "API docs"],
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line-dark bg-background-dark text-slate-400 after-app:border-gray-200 after-app:bg-white after-app:text-slate-600">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="flex items-center gap-2 text-sm font-medium text-white after-app:text-slate-900">
          <Logo />
          ProductRadar
        </p>
        <nav aria-label="Legal and help" className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs tracking-wide uppercase">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={`rounded-sm hover:text-white hover:underline after-app:hover:text-slate-900 ${focusRing}`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-6 text-xs sm:px-6 lg:px-8">
        Scores and margins are calculated estimates from cited evidence, not guarantees. © ProductRadar.
      </p>
    </footer>
  );
}
