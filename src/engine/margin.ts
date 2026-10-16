// Landed margin for the UK and the EU (ARCHITECTURE.md › Landed margin model). Pure functions.
// Every line in the result is sourced evidence or a labelled caller-supplied figure; a component
// that can't be sourced goes in `excluded`, never into the totals as a guess (CLAUDE.md Rule 6).
// SCAFFOLD: signatures only; built test-first in Phase 0.

import type { EUMarginInput, LandedMargin, UKMarginInput } from "@/types/financials";
import { notImplemented } from "./errors";

/**
 * UK: supplier cost at MOQ + freight + UK import duty (where it applies) against the selling price
 * less VAT at the point of sale, the platform fee stack, returns allowance and CAC.
 */
export function calculateUKMargin(input: UKMarginInput): LandedMargin {
  void input;
  return notImplemented("calculateUKMargin");
}

/**
 * EU: supplier cost at MOQ + freight + €3 customs duty + €2 handling per item against the selling
 * price less the destination country's VAT, the platform fee stack, returns allowance and CAC.
 */
export function calculateEUMargin(input: EUMarginInput): LandedMargin {
  void input;
  return notImplemented("calculateEUMargin");
}
