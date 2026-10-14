"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProductDto } from "@/server/products/service";
import { formatPrice, getScore, humanizeSlug, type Score } from "./format";
import { MarginSummary } from "./margin";
import { ConfidenceBadge } from "./score";

const initials = (s: string) =>
  s
    .replace(/\(sample\)/i, "")
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

/** Square product photo on a soft tile; a monogram placeholder when there's no image or it fails to load. */
export function ProductImage({ src, alt, label, className = "" }: { src: string | null; alt: string; label: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    <div
      className={`relative aspect-square overflow-hidden ${
        showImage ? "bg-zinc-50 dark:bg-zinc-200" : "bg-gradient-to-br from-purple-50 to-zinc-100 dark:from-purple-950/60 dark:to-zinc-900"
      } ${className}`}
    >
      {showImage ? (
        // Store images come from many hosts; a plain <img> avoids proxying arbitrary hosts through next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          width={480}
          height={480}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-contain p-5 mix-blend-multiply transition-transform duration-300 ease-out group-hover/card:scale-105 motion-reduce:transition-none motion-reduce:group-hover/card:scale-100"
        />
      ) : (
        <div aria-hidden="true" className="flex size-full flex-col items-center justify-center gap-3">
          <span className="flex size-20 items-center justify-center rounded-2xl bg-white/80 text-2xl font-semibold tracking-tight text-purple-700 shadow-sm ring-1 ring-purple-900/5 dark:bg-zinc-800/80 dark:text-purple-300 dark:ring-white/10">
            {initials(label) || "?"}
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
              <path
                fillRule="evenodd"
                d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.091a.75.75 0 0 0-1.06 0l-2.97 2.97ZM12 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
                clipRule="evenodd"
              />
            </svg>
            No photo yet
          </span>
        </div>
      )}
    </div>
  );
}

function OverallScore({ score }: { score?: Score }) {
  return (
    <p className="flex items-baseline gap-1">
      <span className="sr-only">Overall score: </span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-950 dark:text-white">
        {score ? Math.round(score.value) : "—"}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{score ? "/ 100" : "no score yet"}</span>
    </p>
  );
}

function ValueBadge({ score }: { score?: Score }) {
  const style = !score
    ? "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-400/20"
    : score.value >= 65
      ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20"
      : score.value < 40
        ? "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20"
        : "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20";
  return (
    <span
      title="Value: quality against price, compared with the category"
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ${style}`}
    >
      Value {score ? Math.round(score.value) : "—"}
      <span className="sr-only">{score ? " out of 100, quality against price compared with the category" : ": not enough price data"}</span>
    </span>
  );
}

function SourcesBadge({ product: p }: { product: ProductDto }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-zinc-600 dark:text-zinc-400">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 text-zinc-400 dark:text-zinc-500">
        <path d="M10.75 16.82A7.462 7.462 0 0 1 15 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0 0 18 15.06v-11a.75.75 0 0 0-.546-.721A9.006 9.006 0 0 0 15 3a8.963 8.963 0 0 0-4.25 1.065V16.82ZM9.25 4.065A8.963 8.963 0 0 0 5 3c-.85 0-1.673.118-2.454.339A.75.75 0 0 0 2 4.06v11a.75.75 0 0 0 .954.721A7.506 7.506 0 0 1 5 15.5c1.579 0 3.042.487 4.25 1.32V4.065Z" />
      </svg>
      {p.sourceCount} source{p.sourceCount === 1 ? "" : "s"}
      {p.hasSearchTrend && (
        <>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
              <path
                fillRule="evenodd"
                d="M12.577 4.878a.75.75 0 0 1 .919-.53l4.78 1.281a.75.75 0 0 1 .531.919l-1.281 4.78a.75.75 0 0 1-1.449-.387l.81-3.022a19.407 19.407 0 0 0-5.594 5.203.75.75 0 0 1-1.139.093L7 10.06l-4.72 4.72a.75.75 0 0 1-1.06-1.061l5.25-5.25a.75.75 0 0 1 1.06 0l3.074 3.073a20.923 20.923 0 0 1 5.545-4.931l-3.042-.815a.75.75 0 0 1-.53-.919Z"
                clipRule="evenodd"
              />
            </svg>
            Trends<span className="sr-only"> (Google search interest)</span>
          </span>
        </>
      )}
    </p>
  );
}

function StatusChip({ sample }: { sample: boolean }) {
  return sample ? (
    <span className="rounded-md bg-amber-50/95 px-1.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-950/90 dark:text-amber-300 dark:ring-amber-400/20">
      Sample
    </span>
  ) : (
    <span className="rounded-md bg-emerald-50/95 px-1.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/90 dark:text-emerald-300 dark:ring-emerald-400/20">
      Live
    </span>
  );
}

/**
 * One product in a card grid. The whole card is one link to the product's dossier:
 * the title's link stretches over the card, so screen readers hear a single link
 * named after the product. Hovering lifts the card; pressing settles it back down.
 * The "bento" frame is the landing page's: a hairline ring that lights up purple on hover.
 */
export function ProductCard({
  product: p,
  href,
  rank,
  highlighted = false,
  frame = "default",
}: {
  product: ProductDto;
  href: string;
  rank?: number;
  highlighted?: boolean;
  frame?: "default" | "bento";
}) {
  const overall = getScore(p, "OVERALL");
  const frameClass =
    frame === "bento"
      ? "h-full rounded-2xl bg-white ring-1 ring-zinc-200 duration-300 hover:shadow-purple-900/10 hover:ring-purple-500/50 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-purple-600 dark:ring-white/10 dark:hover:shadow-purple-950/50 dark:hover:ring-purple-500/50 dark:has-[a:focus-visible]:ring-purple-400"
      : `rounded-xl border duration-200 hover:shadow-zinc-900/10 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-purple-600 has-[a:focus-visible]:ring-offset-2 dark:hover:shadow-black/40 dark:has-[a:focus-visible]:ring-purple-400 dark:has-[a:focus-visible]:ring-offset-zinc-950 ${
          highlighted
            ? "border-purple-500 ring-2 ring-purple-500 dark:border-purple-400 dark:ring-purple-400"
            : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
        }`;
  return (
    <li
      data-product-id={p.id}
      className={`group/card relative flex flex-col overflow-hidden bg-white shadow-sm transition ease-out hover:-translate-y-1 hover:shadow-xl active:translate-y-0 active:shadow-md active:duration-75 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-zinc-900 ${frameClass}`}
    >
      <article className="flex flex-1 flex-col">
        <div className="relative">
          <ProductImage src={p.imageUrl} alt={p.name} label={p.brand ?? p.name} key={p.imageUrl ?? "none"} />
          {rank !== undefined && (
            <span className="absolute top-2 left-2 rounded-md bg-white/95 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900/90 dark:text-zinc-200">
              <span className="sr-only">Rank </span>#{rank}
            </span>
          )}
          <span className="absolute top-2 right-2">
            <StatusChip sample={p.isSample} />
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="min-w-0">
            {p.brand && (
              <p className="truncate text-xs font-semibold tracking-wide text-purple-700 uppercase dark:text-purple-300">{p.brand}</p>
            )}
            <h3 className="mt-0.5 line-clamp-2 font-semibold text-zinc-950 dark:text-white" title={p.name}>
              <Link href={href} className="after:absolute after:inset-0 after:z-10 after:content-[''] focus:outline-none">
                {p.name}
              </Link>
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{humanizeSlug(p.category)}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <OverallScore score={overall} />
            {overall && <ConfidenceBadge confidence={overall.confidence} />}
          </div>

          <div className="mt-auto flex items-end justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            {p.bestOffer ? (
              <div className="min-w-0">
                <p className="text-lg font-semibold tabular-nums text-zinc-950 dark:text-white">
                  {formatPrice(p.bestOffer.price.amount, p.bestOffer.price.currency)}
                </p>
                <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">at {p.bestOffer.merchant}</p>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No current offer</p>
            )}
            <ValueBadge score={getScore(p, "VALUE")} />
          </div>

          {p.margin && <MarginSummary margin={p.margin} />}

          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <SourcesBadge product={p} />
            <span
              aria-hidden="true"
              className="inline-flex items-center gap-1 text-sm font-medium text-purple-700 transition-colors group-hover/card:text-purple-900 dark:text-purple-300 dark:group-hover/card:text-purple-200"
            >
              View dossier
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="size-4 transition-transform duration-200 ease-out group-hover/card:translate-x-0.5 motion-reduce:transition-none"
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          </div>
        </div>
      </article>
    </li>
  );
}

export function CardGridSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="aspect-square animate-pulse bg-zinc-200/70 dark:bg-zinc-800/70" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
            <div className="h-6 w-1/2 animate-pulse rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
          </div>
        </div>
      ))}
    </div>
  );
}
