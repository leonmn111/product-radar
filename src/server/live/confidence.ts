// How sure a live result is, from its evidence alone, with v1's formula (scoring engine):
// each source weighs quality × freshness × source type, C = 1 − e^(−Σw/2). A supplier match
// also weighs by how closely its title matches. Nothing below the gate is ever shown (Rule 5).

import { confidenceFrom, evidenceWeight } from "@/server/scoring/engine";
import type { Evidence } from "./types";

export const CONFIDENCE_GATE = 0.7;

/** Σw for a set of evidence: each source counts once, scaled by an optional match score (0–1). */
export function evidenceWeightSum(items: { evidence: Evidence; match?: number }[], asOf: Date): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const { evidence: e, match = 1 } of items) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const w = evidenceWeight(
      { id: e.id, sourceUrl: e.sourceUrl, sourceType: "MARKETPLACE", observedAt: new Date(e.observedAt), qualityScore: e.quality, metric: null, metricValue: null },
      asOf,
    );
    sum += w * Math.max(0, Math.min(1, match));
  }
  return sum;
}

export const confidenceOf = (items: { evidence: Evidence; match?: number }[], asOf: Date) => confidenceFrom(evidenceWeightSum(items, asOf));
