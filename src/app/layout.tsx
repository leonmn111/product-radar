import { Footer } from "@/components/Footer";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@/components/analytics";
import { themeScript, type Theme } from "@/components/theme/theme";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The name and pitch, used wherever a page doesn't set its own.
const TITLE = "ProductRadar";
const DESCRIPTION = "High-performance, automated Amazon and AliExpress product research pipeline.";

export const metadata: Metadata = {
  // https://theproductradar.io in production (APP_URL), so share-card and canonical links are absolute.
  metadataBase: new URL(SITE_URL),
  applicationName: "ProductRadar",
  title: TITLE,
  description: DESCRIPTION,
  // Private by default: public pages (the landing page, /docs) opt in to search engines themselves.
  robots: { index: false, follow: false },
  // Defaults for shared links on every page; the card images come from app/opengraph-image.tsx and
  // app/twitter-image.tsx (src/components/brand/share-card.tsx).
  openGraph: { type: "website", siteName: "ProductRadar", locale: "en_GB", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// New visitors see dark first; the theme toggle saves Light, Dark or System per browser.
const DEFAULT_THEME: Theme = "dark";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script may change the `dark` class before React hydrates, hence suppressHydrationWarning.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${DEFAULT_THEME === "dark" ? "dark " : ""}${geistSans.variable} ${geistMono.variable} h-full antialiased motion-safe:scroll-smooth`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript(DEFAULT_THEME) }} />
        <Analytics />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider defaultTheme={DEFAULT_THEME}>
          {children}
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
