// Confidence from evidence, and the two display gates (CLAUDE.md Rule 5). Pure.
// Formula (v1's, kept): each item weighs quality × freshness (90-day half-life) × source type;
// repeat captures of one source count once; C = 1 − e^(−Σw/2).
// SCAFFOLD: the gates are fixed now; calculateConfidence is built test-first in Phase 0.

import type { Evidence } from "@/types/dossier";
import { notImplemented } from "./errors";

/** A Verdict is shown from this confidence. */
export const VERDICT_GATE = 0.5;
/** Every number (margins, momentum, saturation, scores) is shown from this confidence. */
export const METRIC_GATE = 0.7;

/** 0–1: how strongly the evidence supports a part of the Dossier. */
export function calculateConfidence(evidence: Evidence[]): number {
  void evidence;
  return notImplemented("calculateConfidence");
}
