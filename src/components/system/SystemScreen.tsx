// The 404 and error screens: a terminal-style status window in the site's mono + purple look,
// dark by default and following the light theme too. No hooks, so it renders on the server
// (not-found) and on the client (the error boundaries) alike.

import Link from "next/link";
import type { ReactNode } from "react";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";
const command = `inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2.5 font-mono text-xs font-semibold tracking-widest uppercase ${focusRing}`;
export const primaryCommand = `${command} bg-purple-600 text-white shadow-sm hover:bg-purple-700`;
export const secondaryCommand = `${command} text-zinc-900 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-100 dark:text-zinc-100 dark:ring-white/15 dark:hover:bg-white/5`;

/** A command button's label: a prompt mark, then plain words (so its name reads naturally). */
export const Prompt = ({ children }: { children: ReactNode }) => (
  <>
    <span aria-hidden="true" className="opacity-70">
      &gt;
    </span>
    {children}
  </>
);

export function CommandLink({ href, primary, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={primary ? primaryCommand : secondaryCommand}>
      <Prompt>{children}</Prompt>
    </Link>
  );
}

export function SystemScreen({
  status,
  command: line,
  title,
  spokenTitle,
  children,
  rows,
  actions,
}: {
  /** The badge in the window bar, e.g. "404" or "HALTED". */
  status: string;
  /** The line shown as typed, e.g. "GET /old-link". */
  command: ReactNode;
  /** The diagnostic heading, e.g. "ERROR 404: ROUTE_NOT_FOUND". */
  title: string;
  /** How screen readers say the heading, in plain words. */
  spokenTitle: string;
  children: ReactNode;
  rows: [label: string, value: ReactNode][];
  actions: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 sm:px-6 sm:py-24 dark:bg-zinc-950">
      <section
        aria-labelledby="system-title"
        className="w-full max-w-xl min-w-0 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:shadow-none dark:ring-white/10"
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2.5 dark:border-white/10">
          <p className="flex min-w-0 items-center gap-3 font-mono text-[11px] font-semibold tracking-widest text-zinc-600 uppercase dark:text-zinc-400">
            <span aria-hidden="true" className="flex shrink-0 gap-1.5">
              <span className="size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            </span>
            <span className="truncate">productradar · system</span>
          </p>
          <span className="shrink-0 rounded-sm bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-red-700 ring-1 ring-red-600/20 ring-inset dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/30">
            {status}
          </span>
        </header>

        <div className="p-5 sm:p-8">
          <p className="font-mono text-xs break-all text-zinc-600 dark:text-zinc-400">
            <span aria-hidden="true" className="text-purple-700 dark:text-purple-400">
              ${" "}
            </span>
            {line}
          </p>
          <h1 id="system-title" aria-label={spokenTitle} className="mt-3 font-mono text-lg font-bold tracking-tight break-words text-red-700 sm:text-2xl dark:text-red-400">
            {title}
            <span aria-hidden="true" className="ml-1 inline-block h-[1em] w-[0.55em] translate-y-[0.15em] bg-current motion-safe:animate-pulse" />
          </h1>
          <div className="mt-3 text-sm/6 text-zinc-700 dark:text-zinc-300">{children}</div>

          <dl className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200 font-mono text-xs dark:divide-white/10 dark:border-white/10">
            {rows.map(([label, value]) => (
              <div key={label} className="grid gap-1 py-2 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
                <dt className="font-semibold tracking-widest text-zinc-600 uppercase dark:text-zinc-400">{label}</dt>
                <dd className="min-w-0 break-words text-zinc-900 dark:text-zinc-100">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">{actions}</div>
        </div>
      </section>
    </main>
  );
}
