import { NextResponse, type NextRequest } from "next/server";

// The home page is the public landing page. Someone who's signed in goes straight
// to their dashboard instead. This is only an optimistic check that a session cookie
// exists: /dashboard does the real session check (and sends a stale cookie to sign-in).

// Auth.js session cookies: plain on http, __Secure- on https, split into .0, .1… when large.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function hasSessionCookie(names: string[]) {
  return names.some((n) => SESSION_COOKIES.some((c) => n === c || n.startsWith(`${c}.`)));
}

export function proxy(request: NextRequest) {
  if (!hasSessionCookie(request.cookies.getAll().map((c) => c.name))) return NextResponse.next();
  const url = request.nextUrl.clone(); // keeps the query, e.g. ?checkout=cancelled
  url.pathname = "/dashboard";
  return NextResponse.redirect(url);
}

export const config = { matcher: "/" };
