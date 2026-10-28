import type { NextConfig } from "next";

// Baseline browser hardening for every response.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" }, // no clickjacking of billing/sign-in pages
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, // ignored over plain http
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return [
      // One address for search engines and links: www.<domain>/… → https://<domain>/… (path and query kept).
      {
        source: "/:path*",
        has: [{ type: "host", value: "www\\.(?<domain>.+)" }],
        destination: "https://:domain/:path*",
        permanent: true,
      },
      // The icon was app/icon.svg until 2026-10-28, and /favicon.ico was permanently redirected to it, so some
      // browsers remember that hop: send them on to the official icon (app/favicon.ico is served directly now).
      { source: "/icon.svg", destination: "/icon.png", permanent: false },
    ];
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
