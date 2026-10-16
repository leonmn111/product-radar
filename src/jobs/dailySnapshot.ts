// Daily snapshot job (ROADMAP Phase 0): once a day, record the day's trend, price, sales-rank and ad
// observations for every tracked product and keyword as new, dated evidence. Nothing is overwritten:
// the history is what Momentum's 12-week slope and sales velocity are calculated from.
//
// Runs as a Railway cron service once built (one run per day, exits when done). Provider calls go
// through the usual adapters, each budgeted and cached (CLAUDE.md Rule 8).
// TEMPLATE: types and the entry point only; built test-first in Phase 0.

import { notImplemented } from "@/engine/errors";
import type { Evidence } from "@/types/dossier";

/** Every day at 05:00 UTC. */
export const DAILY_SNAPSHOT_CRON = "0 5 * * *";

export type SnapshotTarget = {
  kind: "product" | "keyword";
  id: string; // product id or normalised keyword
  market: "UK" | "EU";
  country: string;
};

export type SnapshotDeps = {
  now: () => Date;
  /** What to snapshot today. */
  targets: () => Promise<SnapshotTarget[]>;
  /** Today's observations for one target, from the providers (trend, price, rank, ads). */
  observe: (target: SnapshotTarget, asOf: Date) => Promise<Evidence[]>;
  /** Append evidence to the ledger. Never updates or deletes. */
  record: (evidence: Evidence[]) => Promise<void>;
};

export type DailySnapshotReport = {
  startedAt: string;
  finishedAt: string;
  targets: number;
  evidenceRecorded: number;
  failures: { targetId: string; reason: string }[];
};

export async function runDailySnapshot(deps: SnapshotDeps): Promise<DailySnapshotReport> {
  void deps;
  return notImplemented("runDailySnapshot");
}
