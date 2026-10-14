import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ProductRadar — Evidence-backed product intelligence",
  description:
    "Ranked products with scores calculated from sourced, timestamped evidence. Every score shows its confidence and sources.",
  // Private by default: public pages (the landing page, /docs) opt in to search engines themselves.
  robots: { index: false, follow: false },
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
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider defaultTheme={DEFAULT_THEME}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
