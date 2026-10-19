"use client"; // error boundaries must be Client Components

import { Geist, Geist_Mono } from "next/font/google";
import { useEffect } from "react";
import { type ErrorBoundaryProps, ErrorScreen } from "@/components/system/ErrorScreen";
import { applyTheme, readTheme } from "@/components/theme/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Used only when the root layout itself fails. It replaces that layout, so it brings its own
// <html>, styles, fonts and theme (dark by default, as in layout.tsx).
export default function GlobalError({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => applyTheme(readTheme("dark")), []);
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
