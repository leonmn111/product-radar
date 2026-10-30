// The hero's Live Dossier Terminal, assembling itself the way a Dossier is built: the empty card, then the
// product, the evidence ticking in source by source, the confidence filling past the gates, and the
// verdict, in about 2.3 seconds. Plain CSS keyframes (.assemble in globals.css), so it starts on first
// paint rather than after JavaScript loads, and anyone who prefers reduced motion simply sees it whole.
// TiltTerminal (Framer Motion) adds the 3D tilt around it. Server Component.
// It's an example of the process with no figures in it: "Your product", the kinds of evidence a Dossier
// cites, and the real gates (0.5 for a verdict, 0.7 for numbers). Real verdicts come from the paste box.

import type { CSSProperties } from "react";
import { VerdictPill } from "../verdict-pill";

// Each kind of evidence a Dossier cites, and where it comes from.
const EVIDENCE: [string, string][] = [
  ["Amazon UK listings", "Rainforest API"],
  ["AliExpress supplier", "Drop Shipping API"],
  ["Duty and VAT", "GOV.UK"],
  ["Platform fees", "fee schedule"],
  ["Resellability", "brand · UKCA"],
];

// The timeline, in milliseconds from first paint.
const AT = { product: 150, evidence: 550, step: 140, confidence: 1450, verdict: 2000 };

/** One step of the assembly: which keyframes, when, and for how long. */
const step = (keyframes: string, delay: number, duration = 400) =>
  ({ "--assemble": keyframes, "--assemble-delay": `${delay}ms`, "--assemble-duration": `${duration}ms` }) as CSSProperties;

export function HeroAssembly() {
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
        <div className="assemble flex items-center gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]" style={step("assemble-rise", AT.product)}>
          <span aria-hidden="true" className="assemble flex size-12 shrink-0 items-center justify-center rounded-lg bg-slate-200" style={step("assemble-pop", AT.product + 50, 450)}>
            {/* A product photo stands here in a real Dossier. */}
            <svg viewBox="0 0 24 24" fill="none" stroke="#0a0f1d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-7">
              <path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" />
              <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
              <path d="M8 3.5c0 1 1 1 1 2M11 3.5c0 1 1 1 1 2" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate font-sans text-sm font-semibold text-white">Your product</span>
            <span className="block text-xs text-slate-400">Amazon UK · read live</span>
          </span>
        </div>

        {/* 2. The evidence, source by source */}
        <ul className="space-y-1.5">
          {EVIDENCE.map(([what, source], i) => (
            <li key={what} className="assemble flex items-center gap-2" style={step("assemble-slide", AT.evidence + i * AT.step, 300)}>
              <span aria-hidden="true" className="assemble inline-block text-accent-mint" style={step("assemble-check", AT.evidence + i * AT.step + 120, 320)}>
                ✓
              </span>
              <span className="whitespace-nowrap text-slate-200">{what}</span>
              <span aria-hidden="true" className="hidden min-w-3 flex-1 border-b border-dotted border-white/10 sm:block" />
              <span className="ml-auto truncate text-right whitespace-nowrap text-slate-400">{source}</span>
            </li>
          ))}
        </ul>

        {/* 3. Confidence, filling past the gates */}
        <div className="assemble" style={step("assemble-rise", AT.confidence - 100, 200)}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Confidence</span>
            <span>gates 0.5 · 0.7</span>
          </div>
          <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="assemble absolute inset-0 origin-left scale-x-80 rounded-full bg-gradient-to-r from-accent-mint/50 to-accent-mint"
              style={step("assemble-fill", AT.confidence, 550)}
            />
            <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-background-dark/80" />
            <span aria-hidden="true" className="absolute inset-y-0 left-[70%] w-px bg-background-dark/80" />
          </div>
        </div>

        {/* 4. The verdict */}
        <div className="flex items-center justify-between gap-3 border-t border-line-dark pt-3">
          <span className="text-slate-400">Verdict</span>
          <span className="assemble inline-flex" style={step("assemble-pop", AT.verdict, 380)}>
            <VerdictPill tier="TEST" size="sm" />
          </span>
        </div>
      </div>
    </figure>
  );
}
