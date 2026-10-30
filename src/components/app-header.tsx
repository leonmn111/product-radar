import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account/account-menu";
import { Logo, LogoMark } from "@/components/brand/logo";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";

/**
 * The signed-in app's top bar (catalog, dossiers, account): slim, sticky, solid midnight navy. The one dark
 * band in the light app (`on-dark`: dark styles and the bright brand teal inside it), grounding the brand.
 */
export function AppHeader() {
  return (
    <header className="on-dark sticky top-0 z-40 border-b border-white/10 bg-background-dark text-slate-100">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className={`flex items-center rounded-md ${focusRing}`}>
          {/* Below 420 px the full logo doesn't fit beside the balance, Upgrade and account buttons: the mark does. */}
          <Logo priority className="max-[420px]:hidden" />
          <LogoMark className="min-[420px]:hidden" />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/docs"
            className={`hidden rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 md:inline-flex dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white ${focusRing}`}
          >
            API for agents
          </Link>
          <Suspense fallback={<div className="h-9 w-32 animate-pulse rounded-lg bg-slate-100 dark:bg-white/5" />}>
            <AccountMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
