import { env } from "@/lib/env";

/** The site's public address for links in emails and redirects: APP_URL when set, otherwise the request's own origin. */
export function appUrl(requestOrigin: string) {
  return (env.APP_URL ?? requestOrigin).replace(/\/+$/, "");
}

/** The request origin in a server action (no request URL there). Uses Host, which the hosting proxy routes on. */
export function originFromHeaders(headers: Headers) {
  const host = headers.get("host");
  if (!host) return null;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
