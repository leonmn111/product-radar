import { confidenceLevel, formatConfidence, type Score } from "./format";

const CONFIDENCE_STYLE = {
  low: "text-amber-700 dark:text-amber-400",
  medium: "text-slate-600 dark:text-slate-400",
  high: "text-emerald-700 dark:text-emerald-400",
} as const;

/** Compact score: value, a 0–100 bar, and confidence. Missing → explicit "no data". */
export function ScoreCell({ score, emphasis = false }: { score?: Score; emphasis?: boolean }) {
  if (!score) {
    return (
      <span className="text-sm text-slate-400 dark:text-slate-400" title="Not enough evidence to calculate this score">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not enough evidence</span>
      </span>
    );
  }
  const level = confidenceLevel(score.confidence);
  return (
    <div className="flex min-w-[4.5rem] flex-col gap-1">
      <span
        className={`tabular-nums ${emphasis ? "text-lg font-semibold text-slate-900 dark:text-white" : "text-sm font-medium text-slate-900 dark:text-slate-100"}`}
      >
        {score.value.toFixed(1)}
      </span>
      <ScoreBar value={score.value} />
      <span className={`text-xs tabular-nums ${CONFIDENCE_STYLE[level]}`}>
        {formatConfidence(score.confidence)} conf.
      </span>
    </div>
  );
}

export function ScoreBar({ value }: { value: number }) {
  return (
    <span aria-hidden="true" className="block h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-surface-raised">
      <span className="block h-full rounded-full bg-accent-mint" style={{ width: `${value}%` }} />
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const level = confidenceLevel(confidence);
  const style = {
    low: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20",
    medium: "bg-gray-100 text-slate-700 ring-slate-500/20 dark:bg-surface-raised dark:text-slate-300 dark:ring-slate-400/20",
    high: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20",
  }[level];
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>
      {level === "low" ? "Low" : level === "medium" ? "Medium" : "High"} confidence · {formatConfidence(confidence)}
    </span>
  );
}
