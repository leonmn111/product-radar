// The verdict pill: the four-tier scale (engine/verdict.ts), each with its own colour and icon, so it reads
// without colour too. Launch: teal, a check. Test small: amber, a flask. Avoid: red, an X ("Avoid
// (brand-restricted)" when gate G3 decided it). Not enough evidence: slate grey, a question mark.
// Every pairing passes WCAG AA, on the light app and on the dark landing page.

import { verdictLabel, type HardGate, type VerdictTier } from "@/engine/verdict";

const STYLE: Record<VerdictTier, { tone: string; icon: string }> = {
  LAUNCH: { tone: "bg-accent-mint text-on-accent", icon: "M4.5 10.5 8 14l7.5-8" },
  TEST: {
    tone: "bg-amber-400 text-amber-950",
    icon: "M7.5 2.75h5M8.5 2.75v4.5L4.2 14.9a1.6 1.6 0 0 0 1.4 2.35h8.8a1.6 1.6 0 0 0 1.4-2.35L11.5 7.25v-4.5M6 12.25h8",
  },
  AVOID: { tone: "bg-red-700 text-white dark:bg-red-400 dark:text-red-950", icon: "M5.5 5.5l9 9m0-9-9 9" },
  WITHHELD: {
    tone: "bg-slate-600 text-white dark:bg-slate-400 dark:text-slate-950",
    icon: "M7.6 7.4a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .9-1 1.6v.6M10 15.25v.01",
  },
};

export function VerdictPill({
  tier,
  gate = null,
  size = "md",
  className = "",
}: {
  tier: VerdictTier;
  gate?: HardGate | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const s = STYLE[tier];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"} ${s.tone} ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={size === "sm" ? "size-3.5 shrink-0" : "size-4 shrink-0"}
      >
        <path d={s.icon} />
      </svg>
      {verdictLabel(tier, gate)}
    </span>
  );
}
