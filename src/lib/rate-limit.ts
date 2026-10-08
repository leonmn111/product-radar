// Fixed-window-per-key in-memory rate limiter. Per server process only — fine
// for a single instance; use a shared store (e.g. Redis) when scaling out.

export function createRateLimiter({ windowMs, max, maxKeys = 10_000 }: { windowMs: number; max: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  return {
    /** Records a hit for `key`; returns true when the key is over its limit. */
    limited(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        for (const [k, ts] of hits) if (ts.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      return recent.length > max;
    },
  };
}
