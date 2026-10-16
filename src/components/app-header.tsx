import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account/account-menu";
import { Logo } from "@/components/brand/logo";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";

/** The signed-in app's top bar (catalog, dossiers, account): slim, sticky, the landing page's look. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className={`flex items-center gap-2.5 rounded-md font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 ${focusRing}`}>
          <Logo />
          {/* The narrowest phones show just the mark, so the account controls fit beside it. */}
          <span className="max-[400px]:sr-only">ProductRadar</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/docs"
            className={`hidden rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 md:inline-flex dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white ${focusRing}`}
          >
            API for agents
          </Link>
          <Suspense fallback={<div className="h-9 w-32 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />}>
            <AccountMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
