// The application shell's top bar: the brand, optional in-page section links, Docs, Sign in and the
// one call to action, "Run Dossier". A Server Component: no client JavaScript.
// Below lg the section links fold away; the brand, Docs and the call to action always stay.

import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/logo";

export type NavLink = { href: string; label: string };

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const navLink = `rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white ${focusRing}`;
const cta = `inline-flex items-center rounded-lg bg-accent-mint px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-on-accent shadow-md shadow-accent-mint/20 transition duration-200 hover:scale-[1.03] hover:bg-accent-mint-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 ${focusRing}`;

export function Navbar({ links = [], ctaHref = "/get-started" }: { links?: NavLink[]; ctaHref?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line-dark/80 bg-background-dark/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className={`flex items-center rounded-md ${focusRing}`}>
          {/* Below 370 px the full logo doesn't fit beside Docs and Run Dossier: the mark does. */}
          <Logo priority className="max-[370px]:hidden" />
          <LogoMark className="min-[370px]:hidden" />
        </Link>
        {links.length > 0 && (
          <nav aria-label="On this page" className="hidden items-center gap-1 lg:flex">
            {links.map(({ href, label }) => (
              <a key={href} href={href} className={navLink}>
                {label}
              </a>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/docs" className={navLink}>
            Docs
          </Link>
          {/* On the narrowest phones the hero's Sign in button sits right below. */}
          <Link href="/signin" className={`max-[420px]:hidden ${navLink}`}>
            Sign in
          </Link>
          <Link href={ctaHref} className={cta}>
            Run Dossier
          </Link>
        </div>
      </div>
    </header>
  );
}
