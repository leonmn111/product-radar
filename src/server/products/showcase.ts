// Which live products the public landing page shows off. Pure functions over
// product DTOs: no I/O, no clock. The point of the showcase is to prove the
// margin engine on real captured prices, so only products with a real price gap
// between stores qualify. Nothing is invented to fill the slots (CLAUDE.md Rule 3):
// with no gap anywhere, the showcase is simply empty.

import type { ArbitrageRating } from "@/server/margins/engine";
import type { ProductDto } from "./service";

const RATING_RANK: Record<ArbitrageRating, number> = { HIGH_ARBITRAGE: 2, MODERATE: 1, RETAIL_ONLY: 0 };

const routes = (p: ProductDto) => (p.margin ? [p.margin.arbitrage, p.margin.arbitrageOwnStore] : []);

/** True when two or more stores sell it right now, in one currency, at different prices. */
export function hasPriceGap(p: ProductDto) {
  return routes(p).some((s) => s.buy !== null && s.resalePrice !== null && s.resalePrice > s.buy.price);
}

const bestRating = (p: ProductDto) => Math.max(0, ...routes(p).map((s) => RATING_RANK[s.rating]));
const overall = (p: ProductDto) => p.scores.OVERALL?.value ?? 0;

/**
 * Up to `n` live products with a price gap: the strongest resale rating on either
 * route first, then the most independent sources, then the highest overall score.
 * After the first pick, a product from a category not yet shown goes ahead of the queue.
 */
export function pickShowcase(products: ProductDto[], n = 2): ProductDto[] {
  const queue = products
    .filter((p) => !p.isSample && hasPriceGap(p))
    .sort(
      (a, b) =>
        bestRating(b) - bestRating(a) || b.sourceCount - a.sourceCount || overall(b) - overall(a) || a.name.localeCompare(b.name),
    );
  const picks: ProductDto[] = [];
  while (picks.length < n && queue.length > 0) {
    const fresh = queue.findIndex((p) => !picks.some((q) => q.category === p.category));
    picks.push(...queue.splice(Math.max(fresh, 0), 1));
  }
  return picks;
}
