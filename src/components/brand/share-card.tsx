import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The social card for shared links: a terminal window in the site's dark mono + purple look.
// Rendered by app/opengraph-image.tsx and app/twitter-image.tsx (and the /docs copies), at build time.
// The font is Geist Mono, the site's own mono face (SIL Open Font License, src/assets/fonts/OFL.txt).
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };
export const SHARE_CARD_ALT =
  "ProductRadar: a high-performance, automated Amazon and AliExpress product research pipeline. A terminal window running root@productradar:~# ./launch_pipeline.sh.";

const font = (file: string) => readFile(join(process.cwd(), "src/assets/fonts", file));
// Read once, when the module loads (as the Next.js docs do): reading inside the image function
// counts as uncached data, which would make the cards render on every request instead of at build.
const [regular, bold] = await Promise.all([font("GeistMono-Regular.ttf"), font("GeistMono-Bold.ttf")]);

const C = {
  page: "#09090b", // zinc-950
  window: "#111113",
  line: "rgba(255,255,255,0.12)",
  dot: "#3f3f46", // zinc-700
  text: "#fafafa",
  body: "#d4d4d8", // zinc-300
  muted: "#a1a1aa", // zinc-400
  accent: "#c084fc", // purple-400
  brand: "#9333ea", // purple-600
};

const OUTPUT = [
  ["8-part Dossier", "verdict, landed margin, momentum, suppliers"],
  ["UK/EU margin", "after VAT, duty, fees and ads"],
  ["Evidence", "every number cites its source"],
];

export function shareCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 56,
          backgroundColor: C.page,
          backgroundImage: "radial-gradient(circle at 88% 0%, rgba(147,51,234,0.38), rgba(9,9,11,0) 58%)",
          fontFamily: "Geist Mono",
          color: C.text,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, borderRadius: 18, border: `1px solid ${C.line}`, backgroundColor: C.window }}>
          {/* Window bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, padding: "0 28px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <div style={{ display: "flex", gap: 10 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: C.dot }} />
                ))}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 3, color: C.muted }}>PRODUCTRADAR · PIPELINE</div>
            </div>
            <div style={{ fontSize: 20, color: C.muted }}>theproductradar.io</div>
          </div>

          {/* Session */}
          <div style={{ display: "flex", flexDirection: "column", padding: "40px 48px" }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 26 }}>
              <span style={{ color: C.accent, fontWeight: 700 }}>root@productradar:~#</span>
              <span style={{ marginLeft: 16 }}>./launch_pipeline.sh</span>
              <div style={{ width: 14, height: 30, marginLeft: 8, backgroundColor: C.accent }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 30 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 84, height: 84, borderRadius: 18, backgroundColor: C.brand }}>
                <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="8.5" />
                  <circle cx="12" cy="12" r="4.5" />
                  <path d="M12 12 18 6" />
                </svg>
              </div>
              <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>ProductRadar</div>
            </div>

            <div style={{ marginTop: 22, fontSize: 30, lineHeight: 1.35, color: C.body, maxWidth: 1000 }}>
              High-performance, automated Amazon and AliExpress product research pipeline.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 26, fontSize: 21 }}>
              {OUTPUT.map(([k, v]) => (
                <div key={k} style={{ display: "flex" }}>
                  <span style={{ color: C.accent, fontWeight: 700 }}>&gt;</span>
                  <span style={{ marginLeft: 14, color: C.text, fontWeight: 700 }}>{k}</span>
                  <span style={{ marginLeft: 14, color: C.muted }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...SHARE_CARD_SIZE,
      fonts: [
        { name: "Geist Mono", data: regular, weight: 400, style: "normal" },
        { name: "Geist Mono", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
