// The five resellability checks (engine/compliance.ts), in plain words. No imports, so both the
// server-side margin service and the browser can use it.

import type { ResellabilityFlags } from "@/types/dossier";

export const RESELLABILITY_LABEL: Record<keyof ResellabilityFlags, string> = {
  brandDirect: "Sold by the brand itself",
  trademarkRisk: "Brand or trademark",
  requiresUKCA: "Needs UKCA marking",
  cosmetics: "Cosmetics rules",
  batteries: "Contains a battery",
};

export const RESELLABILITY_ORDER = Object.keys(RESELLABILITY_LABEL) as (keyof ResellabilityFlags)[];

/** The checks a product fails, as "label: reason". */
export const trippedChecks = (flags: ResellabilityFlags) =>
  RESELLABILITY_ORDER.filter((k) => flags[k].value === true).map((k) => `${RESELLABILITY_LABEL[k]}: ${flags[k].reason}`);
