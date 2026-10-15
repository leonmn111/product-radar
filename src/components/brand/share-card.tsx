import { ImageResponse } from "next/og";

// The social card for shared links: the landing page's headline on the brand gradient.
// Rendered by both app/opengraph-image.tsx and app/twitter-image.tsx.
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

export function shareCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #3b0764 0%, #581c87 55%, #7e22ce 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#d8b4fe" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <path d="M12 12 19 5" />
          </svg>
          ProductRadar
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>
            <span>Find the spread.</span>
            <span>Ignore the noise.</span>
          </div>
          <div style={{ fontSize: 30, color: "#e9d5ff", maxWidth: 960, lineHeight: 1.35 }}>
            Rule-based product intelligence and dual-margin analytics for serious e-commerce operators.
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 24, color: "#f3e8ff" }}>
          <span>Every number cites its source</span>
          <span style={{ color: "#c084fc" }}>·</span>
          <span>For operators and buyer agents</span>
        </div>
      </div>
    ),
    SHARE_CARD_SIZE,
  );
}
