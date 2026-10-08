import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signIn } from "@/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import { getViewer } from "@/server/auth/entitlements";

export const metadata: Metadata = {
  title: "Sign in — ProductRadar",
  description: "Sign in to ProductRadar with a one-time email link. No password needed.",
  robots: { index: false, follow: false },
};

// Only same-site paths may be used as the post-sign-in destination.
function safeCallback(raw: string | string[] | undefined) {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

// Stops the form being used to flood someone's inbox (or burn the email quota).
const perEmail = createRateLimiter({ windowMs: 15 * 60_000, max: 3 });
const perClient = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });

const ERRORS: Record<string, string> = {
  RateLimited: "Too many sign-in emails requested. Please wait 15 minutes and try again.",
  Verification: "That sign-in link has expired or was already used. Request a new one below.",
  EmailSignin: "We couldn't send the sign-in email. Please try again in a moment.",
  Configuration: "Sign-in isn't configured correctly on the server.",
};

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const callbackUrl = safeCallback(String(formData.get("callbackUrl") ?? "/"));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/signin?error=InvalidEmail&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  // Per-client limiting only when the host tells us who the client is — otherwise
  // every visitor would share one bucket and could lock each other out.
  const client = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  if ((client && perClient.limited(client)) || perEmail.limited(email)) {
    redirect(`/signin?error=RateLimited&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  // redirect:false returns the URL Auth.js would redirect to — an error page if sending failed.
  const next = await signIn("resend", { email, redirectTo: callbackUrl, redirect: false });
  const error = typeof next === "string" ? new URL(next, "http://x").searchParams.get("error") : null;
  redirect(error ? `/signin?error=${encodeURIComponent(error)}&callbackUrl=${encodeURIComponent(callbackUrl)}` : "/signin/check-email");
}

async function SignInForm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeCallback(params.callbackUrl);
  if (await getViewer()) redirect(callbackUrl);

  const errorKey = typeof params.error === "string" ? params.error : null;
  const error = errorKey === "InvalidEmail" ? "Please enter a valid email address." : errorKey ? (ERRORS[errorKey] ?? "Sign-in failed. Please try again.") : null;
  const upgrading = callbackUrl === "/upgrade";

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
        {upgrading ? "Sign in to upgrade to Pro" : "Sign in to ProductRadar"}
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Enter your email and we&apos;ll send you a one-time sign-in link. No password needed — new accounts are created
        automatically.
        {upgrading && " You'll go straight to secure checkout afterwards."}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-600/20 ring-inset dark:bg-red-950/30 dark:text-red-200 dark:ring-red-400/30"
        >
          {error}
        </p>
      )}

      <form action={sendLink} className="mt-6 space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            className="mt-1 w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-300 ring-inset placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:text-zinc-950 dark:hover:bg-indigo-400"
        >
          Email me a sign-in link
        </button>
      </form>
    </>
  );
}

export default function SignInPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/"
          className="text-sm font-semibold text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-indigo-300"
        >
          ← ProductRadar
        </Link>
        <div className="mt-4">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />}>
            <SignInForm searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
