import { ImageResponse } from "next/og";

// Home-screen icon for iPhone and iPad: the midnight radar mark on brand mint. Built at deploy time.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#00bfa5" }}>
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#0a0f1d" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 12 18 6" />
        </svg>
      </div>
    ),
    size,
  );
}
