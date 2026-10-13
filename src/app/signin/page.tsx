import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewer } from "@/server/auth/entitlements";
import { AuthCard } from "./auth-card";
import { AuthPanel } from "./auth-panel";
import { safeCallback } from "./callback-url";

export const metadata: Metadata = {
  title: "Sign in — ProductRadar",
  description: "Sign in to ProductRadar or create a free account, with a password or a one-time email link.",
  robots: { index: false, follow: false },
};

// Errors that come back here through a redirect: the email-link flow, or Auth.js's own sign-in endpoint.
const LINK_ERRORS: Record<string, string> = {
  CredentialsSignin: "That email and password don't match. Check them, or use an email link instead.",
  InvalidEmail: "Please enter a valid email address.",
  RateLimited: "Too many sign-in emails requested. Please wait 15 minutes and try again.",
  Verification: "That sign-in link has expired or was already used. Request a new one below.",
  EmailSignin: "We couldn't send the sign-in email. Please try again in a moment.",
  // Auth.js reports any failure to send the email (e.g. the provider rejecting
  // the address) as "Configuration"; the real reason is in the server logs.
  Configuration: "We couldn't send a sign-in email to that address. Please check it and try again.",
};

async function SignInForm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeCallback(params.callbackUrl);
  if (await getViewer()) redirect(callbackUrl);

  const errorKey = typeof params.error === "string" ? params.error : null;
  const linkError =
    errorKey === "CredentialsSignin" && params.code === "rate_limited"
      ? "Too many sign-in attempts. Please wait 15 minutes, or use an email link instead."
      : errorKey
        ? (LINK_ERRORS[errorKey] ?? "Sign-in failed. Please try again.")
        : null;
  const upgrading = callbackUrl === "/upgrade";
  const registering = params.tab === "register";

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
        {upgrading ? (registering ? "Create your account to start Pro" : "Sign in to upgrade to Pro") : "Welcome to ProductRadar"}
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Sign in or create a free account with a password, or get a one-time link by email.
        {upgrading && " You'll go straight to secure checkout afterwards."}
      </p>
      <div className="mt-6">
        <AuthPanel callbackUrl={callbackUrl} initialTab={registering ? "register" : "signin"} linkError={linkError} />
      </div>
    </>
  );
}

export default function SignInPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <AuthCard>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />}>
        <SignInForm searchParams={props.searchParams} />
      </Suspense>
    </AuthCard>
  );
}
