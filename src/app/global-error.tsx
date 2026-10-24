"use client"; // error boundaries must be Client Components

import { Geist_Mono, Inter } from "next/font/google";
import { type ErrorBoundaryProps, ErrorScreen } from "@/components/system/ErrorScreen";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Used only when the root layout itself fails. It replaces that layout, so it brings its own
// <html>, styles and fonts (dark only, as in layout.tsx).
export default function GlobalError({ error, retry }: ErrorBoundaryProps) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
