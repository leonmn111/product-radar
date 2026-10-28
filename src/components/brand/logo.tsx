// The official ProductRadar logo (public/productradarwordlogo.png: the mark stacked over the name), as built
// into public/brand by scripts/brand-assets.mjs. The image carries the name, so no text sits beside it: its
// alt text names the link it's in. Stacked, the name is about a quarter of the height, so it's shown 48 px tall
// in the bars (the name about 12 px) and 40 px in the footer.
//   tone "light": the reversed logo (white and teal), for the dark bars, where the navy original would vanish
//   tone "dark":  the original colours, for light backgrounds
// Served as-is (4× its display height), so it stays sharp on every screen.

import Image from "next/image";

const WORDMARK = { width: 503, height: 256 }; // public/brand/logo-wordmark*.png

/** The logo with the name, `height` px tall. */
export function Logo({ tone = "light", height = 48, className = "", priority = false }: { tone?: "light" | "dark"; height?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src={tone === "light" ? "/brand/logo-wordmark-light.png" : "/brand/logo-wordmark.png"}
      alt="ProductRadar"
      width={Math.round((WORDMARK.width * height) / WORDMARK.height)}
      height={height}
      unoptimized
      priority={priority}
      className={`h-auto max-w-none shrink-0 ${className}`}
    />
  );
}
