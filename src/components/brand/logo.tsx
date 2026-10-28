// The official ProductRadar logo (public/Logowithwriting.png and public/mainlogo.png), as built into
// public/brand by scripts/brand-assets.mjs. The image carries the name, so no text sits beside it: its alt
// text names the link it's in.
//   tone "light": the reversed logo (white and teal), for the dark bars, where the navy original would vanish
//   tone "dark":  the original colours, for light backgrounds
// Served as-is (4× its display height), so it stays sharp on every screen.

import Image from "next/image";

const WORDMARK = { width: 620, height: 128 }; // public/brand/logo-wordmark*.png

/** The logo with the name, `height` px tall. */
export function Logo({ tone = "light", height = 32, className = "", priority = false }: { tone?: "light" | "dark"; height?: number; className?: string; priority?: boolean }) {
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
