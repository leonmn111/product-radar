// Trend slopes for Momentum (ARCHITECTURE.md › Momentum): ordinary least-squares linear regression
// of a value over time. Pure.
//
// For an Amazon sales rank, a NEGATIVE slope means the rank number is falling: the product is
// climbing the best-seller list (selling more). For a price, a negative slope means it's getting cheaper.

export type TimePoint = { at: number; value: number }; // at: Unix ms

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * The least-squares slope of `history`, in value units per week (e.g. rank places per week). Null
 * when there's no trend to measure: fewer than two points, or all at the same time. Points with a
 * non-finite value or time are ignored.
 */
export function calculateTrendSlope(history: readonly TimePoint[]): number | null {
  const pts = history.filter((p) => Number.isFinite(p.at) && Number.isFinite(p.value));
  if (pts.length < 2) return null;
  // Centre the time axis (in weeks) to keep the sums small and exact enough.
  const t0 = pts[0].at;
  const xs = pts.map((p) => (p.at - t0) / WEEK_MS);
  const meanX = xs.reduce((s, x) => s + x, 0) / xs.length;
  const meanY = pts.reduce((s, p) => s + p.value, 0) / pts.length;
  let sxx = 0;
  let sxy = 0;
  pts.forEach((p, i) => {
    const dx = xs[i] - meanX;
    sxx += dx * dx;
    sxy += dx * (p.value - meanY);
  });
  return sxx === 0 ? null : sxy / sxx;
}

/**
 * A step history (each value holds until the next change, as Keepa records it) as one value per
 * UTC day from `from` to `to`: the value in force at the end of each day. Days before the first
 * known value, or while the value is unknown (null), are left out rather than guessed.
 */
export function dailySeries(changes: readonly { at: number; value: number | null }[], from: Date, to: Date): TimePoint[] {
  const sorted = [...changes].sort((a, b) => a.at - b.at);
  const out: TimePoint[] = [];
  let i = 0;
  let current: number | null = null;
  const first = Math.floor(from.getTime() / DAY_MS);
  const last = Math.floor(to.getTime() / DAY_MS);
  for (let day = first; day <= last; day++) {
    const end = Math.min((day + 1) * DAY_MS - 1, to.getTime());
    while (i < sorted.length && sorted[i].at <= end) current = sorted[i++].value;
    if (current !== null) out.push({ at: day * DAY_MS, value: current });
  }
  return out;
}
