import { ImageResponse } from "next/og";

// The social card shown when the site is shared (Open Graph and X/Twitter). Built at deploy time.
export const alt = "ProductRadar: know if a product is worth selling before you stock it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4338ca 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <path d="M12 12 19 5" />
          </svg>
          ProductRadar
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 980 }}>
            Know if a product is worth selling before you stock it.
          </div>
          <div style={{ fontSize: 30, color: "#c7d2fe", maxWidth: 960, lineHeight: 1.35 }}>
            Evidence-backed scores, real price gaps between stores, and what you keep after eBay or Shopify fees.
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 24, color: "#e0e7ff" }}>
          <span>Every number cites its source</span>
          <span style={{ color: "#818cf8" }}>·</span>
          <span>For operators and buyer agents</span>
        </div>
      </div>
    ),
    size,
  );
}
