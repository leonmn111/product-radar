// The highest RRP the stores currently publish for a product (CLAUDE.md Rule 3: each
// one is a captured page with its own evidence row). Same rules as prices: the newest
// capture of each store page, no older than the scoring engine trusts an offer, and
// in one currency (nothing is converted).

import { OFFER_MAX_AGE_DAYS } from "@/server/scoring/engine";

const DAY_MS = 86_400_000;

export type RrpOffer = {
  url: string;
  merchant: string;
  currency: string;
  observedAt: Date;
  rrp: number | null;
  rrpEvidenceId: string | null;
};

export function highestRrp(offers: RrpOffer[], currency: string | null, asOf: Date) {
  if (!currency) return null;
  const newest = new Map<string, RrpOffer>();
  for (const o of offers) {
    const seen = newest.get(o.url);
    if (!seen || o.observedAt > seen.observedAt) newest.set(o.url, o);
  }
  const top = [...newest.values()]
    .filter((o): o is RrpOffer & { rrp: number; rrpEvidenceId: string } => o.rrp !== null && o.rrpEvidenceId !== null)
    .filter((o) => {
      const age = (asOf.getTime() - o.observedAt.getTime()) / DAY_MS;
      return o.currency === currency && age >= 0 && age <= OFFER_MAX_AGE_DAYS;
    })
    .sort((a, b) => b.rrp - a.rrp || a.url.localeCompare(b.url))[0];
  return top
    ? {
        amount: top.rrp.toFixed(2),
        currency,
        merchant: top.merchant,
        url: top.url,
        observedAt: top.observedAt.toISOString(),
        evidenceId: top.rrpEvidenceId,
      }
    : null;
}
