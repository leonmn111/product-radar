import { Footer } from "@/components/Footer";
import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Analytics } from "@/components/analytics";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Inter for text (Tailwind's font-sans), Geist Mono for the terminal look (font-mono). See globals.css.
const inter = Inter({
  variable: "--font-inter",
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
  // Defaults for shared links on every page. og:image and twitter:image are the share card from
  // app/opengraph-image.tsx and app/twitter-image.tsx (src/components/brand/share-card.tsx), which carries the
  // official logo (public/Logowithwriting.png). It is drawn on the midnight card rather than shared as the
  // bare transparent PNG, which some apps show on black, where its navy lettering would vanish. The tab icons
  // are app/favicon.ico, app/icon.png and app/apple-icon.png, from public/mainlogo.png (scripts/brand-assets.mjs).
  openGraph: { type: "website", siteName: "ProductRadar", locale: "en_GB", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Dark only: `dark` is always on, so every page renders its dark styles (globals.css).
    <html lang="en" className={`dark ${inter.variable} ${geistMono.variable} h-full antialiased motion-safe:scroll-smooth`}>
      <head>
        <Analytics />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Footer />
      </body>
    </html>
  );
}
