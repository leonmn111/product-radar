"use client";

// The hero's Live Dossier Terminal, assembling itself on load the way a Dossier is built: the empty card,
// then the product, the evidence ticking in source by source, the confidence filling past the gates, and
// the verdict. About 2.3 seconds in all; for anyone who prefers reduced motion it's simply there.
// It's an example of the process with no figures in it: "Your product", the kinds of evidence a Dossier
// cites, and the real gates (0.5 for a verdict, 0.7 for numbers). Real verdicts come from the paste box.
// Rendered inside TiltTerminal's LazyMotion, hence `m`.

import { m, useReducedMotion, type Transition } from "framer-motion";

// Each kind of evidence a Dossier cites, and where it comes from.
const EVIDENCE: [string, string][] = [
  ["Amazon UK listings", "Rainforest API"],
  ["AliExpress supplier", "Drop Shipping API"],
  ["Duty and VAT", "GOV.UK · EU"],
  ["Platform fees", "fee schedule"],
  ["Resellability", "brand · UKCA"],
];

// The timeline, in seconds from first paint.
const AT = { product: 0.15, evidence: 0.55, step: 0.14, confidence: 1.45, verdict: 2.0 };

export function HeroAssembly() {
  const still = useReducedMotion();
  const t = (delay: number, rest: Transition = {}): Transition => (still ? { duration: 0 } : { delay, duration: 0.4, ease: [0.22, 1, 0.36, 1], ...rest });

  return (
    <figure className="min-w-0 overflow-hidden rounded-2xl bg-surface-dark shadow-2xl ring-1 shadow-black/40 ring-line-dark">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line-dark px-4 py-3 font-mono text-xs text-slate-400">
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
          </span>
          Live Dossier Terminal
        </span>
        <span>Example</span>
      </figcaption>

      <div className="space-y-4 p-4 font-mono text-[0.75rem]/6 sm:p-5 sm:text-[0.8rem]/6">
        <p className="break-words text-slate-200">
          <span aria-hidden="true" className="text-accent-mint">$ </span>
          dossier amazon.co.uk/dp/&lt;your-asin&gt;<span className="hidden sm:inline"> --market UK</span>
        </p>

        {/* 1. The product */}
        <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={t(AT.product)} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
          <m.span
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={t(AT.product + 0.05, { duration: 0.45 })}
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-slate-200"
          >
            {/* A product photo stands here in a real Dossier. */}
            <svg viewBox="0 0 24 24" fill="none" stroke="#0a1020" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-7">
              <path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" />
              <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
              <path d="M8 3.5c0 1 1 1 1 2M11 3.5c0 1 1 1 1 2" />
            </svg>
          </m.span>
          <span className="min-w-0">
            <span className="block truncate font-sans text-sm font-semibold text-white">Your product</span>
            <span className="block text-xs text-slate-400">Amazon UK · read live</span>
          </span>
        </m.div>

        {/* 2. The evidence, source by source */}
        <ul className="space-y-1.5">
          {EVIDENCE.map(([what, source], i) => (
            <m.li
              key={what}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={t(AT.evidence + i * AT.step, { duration: 0.3 })}
              className="flex items-center gap-2"
            >
              <m.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={still ? { duration: 0 } : { delay: AT.evidence + i * AT.step + 0.12, type: "spring", stiffness: 500, damping: 22 }}
                aria-hidden="true"
                className="text-accent-mint"
              >
                ✓
              </m.span>
              <span className="whitespace-nowrap text-slate-200">{what}</span>
              <span aria-hidden="true" className="hidden min-w-3 flex-1 border-b border-dotted border-white/10 sm:block" />
              <span className="ml-auto truncate text-right whitespace-nowrap text-slate-400">{source}</span>
            </m.li>
          ))}
        </ul>

        {/* 3. Confidence, filling past the gates */}
        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t(AT.confidence - 0.1, { duration: 0.2 })}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Confidence</span>
            <span>gates 0.5 · 0.7</span>
          </div>
          <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <m.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 0.8 }}
              transition={t(AT.confidence, { duration: 0.55 })}
              style={{ originX: 0 }}
              className="absolute inset-0 rounded-full bg-gradient-to-r from-accent-mint/50 to-accent-mint"
            />
            <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-background-dark/80" />
            <span aria-hidden="true" className="absolute inset-y-0 left-[70%] w-px bg-background-dark/80" />
          </div>
        </m.div>

        {/* 4. The verdict */}
        <div className="flex items-center justify-between gap-3 border-t border-line-dark pt-3">
          <span className="text-slate-400">Verdict</span>
          <m.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={still ? { duration: 0 } : { delay: AT.verdict, type: "spring", stiffness: 380, damping: 20, mass: 0.7 }}
            className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold tracking-wider text-background-dark"
          >
            TEST · start small
          </m.span>
        </div>
      </div>
    </figure>
  );
}
