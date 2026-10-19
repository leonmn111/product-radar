// The layout for the Terms and the Privacy Policy: a dense, terminal-style document. Monospace
// labels, numbers and contents; the body in the site's sans for long-form reading.

import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { LEGAL } from "@/lib/legal";

export type LegalSection = { id: string; title: string; body: ReactNode };

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";
export const legalLink = `font-medium text-purple-700 underline decoration-purple-300 underline-offset-2 hover:decoration-purple-600 dark:text-purple-300 dark:decoration-purple-700 dark:hover:decoration-purple-300 ${focusRing}`;

/** A detail from src/lib/legal.ts, or a marked placeholder while it's missing. */
export function Detail({ value, missing }: { value: string | null; missing: string }) {
  if (value) return <>{value}</>;
  return <mark className="rounded-sm bg-amber-100 px-1 font-mono text-[0.85em] text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">[to be added: {missing}]</mark>;
}

/** The contact email as a mailto link, or its placeholder. */
export function ContactEmail() {
  return LEGAL.contactEmail ? (
    <a href={`mailto:${LEGAL.contactEmail}`} className={legalLink}>
      {LEGAL.contactEmail}
    </a>
  ) : (
    <Detail value={null} missing="contact email" />
  );
}

export function LegalPage({ kind, title, intro, sections, related }: { kind: string; title: string; intro: ReactNode; sections: LegalSection[]; related: { href: string; label: string } }) {
  return (
    <div className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <p className="font-mono text-[11px] font-semibold tracking-widest text-purple-700 uppercase dark:text-purple-300">Legal · {kind}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">{title}</h1>
        <p className="mt-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {LEGAL.tradingName} · {LEGAL.website.replace(/^https?:\/\//, "")} · last updated {LEGAL.lastUpdated}
        </p>
        <div className="mt-6 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">{intro}</div>

        <nav aria-label="Contents" className="mt-8 rounded-md bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
          <p className="font-mono text-[11px] font-semibold tracking-widest text-zinc-600 uppercase dark:text-zinc-400">Contents</p>
          <ol className="mt-2 grid gap-x-6 gap-y-1 font-mono text-[13px] sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={`rounded-sm text-zinc-800 hover:text-purple-700 hover:underline dark:text-zinc-200 dark:hover:text-purple-300 ${focusRing}`}>
                  <span className="text-zinc-500">{String(i + 1).padStart(2, "0")}</span> {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20">
              <h2 id={`${s.id}-h`} className="font-mono text-sm font-semibold tracking-widest text-zinc-950 uppercase dark:text-zinc-50">
                <span className="text-purple-700 dark:text-purple-400">{String(i + 1).padStart(2, "0")}</span> {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-[15px] leading-7 text-zinc-700 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5 dark:text-zinc-300">{s.body}</div>
            </section>
          ))}
        </div>

        <p className="mt-12 border-t border-zinc-200 pt-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          See also the{" "}
          <Link href={related.href} className={legalLink}>
            {related.label}
          </Link>
          . Questions: <ContactEmail />.
        </p>
      </main>
    </div>
  );
}
