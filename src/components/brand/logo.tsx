// The official ProductRadar logo (public/logomain.png: the radar mark as the "P" of the name), as built into
// public/brand by scripts/brand-assets.mjs. The image carries the name, so no text sits beside it: its alt text
// names the link it's in. Shown 32 px tall in the bars and 28 px in the footer.
//   tone "light": the reversed logo (white and teal), for the dark bars, where the navy original would vanish
//   tone "dark":  the original colours, for light backgrounds
// Served as-is (4× its display height), so it stays sharp on every screen.

import Image from "next/image";

const WORDMARK = { width: 680, height: 128 }; // public/brand/logo-wordmark*.png

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

/**
 * The radar mark alone (the app icon, src/app/icon.png), `size` px square: where the full logo can't fit
 * beside a phone's account controls.
 */
export function LogoMark({ size = 32, className = "", priority = false }: { size?: number; className?: string; priority?: boolean }) {
  return <Image src="/icon.png" alt="ProductRadar" width={size} height={size} unoptimized priority={priority} className={`shrink-0 rounded-md ${className}`} />;
}
