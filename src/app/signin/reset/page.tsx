import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { resetLinkEmail } from "@/server/auth/password-reset";
import { AuthCard } from "../auth-card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Choose a new password — ProductRadar",
  description: "Set a new ProductRadar password.",
  robots: { index: false, follow: false },
};

async function ResetContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection(); // per request: the link's validity depends on the current time
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const email = await resetLinkEmail(db, token);

  if (!email) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">This link has expired</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Password reset links work once and for 1 hour. Request a new one and use the latest email.
        </p>
        <Link
          href="/signin/forgot"
          className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:text-zinc-950 dark:hover:bg-indigo-400"
        >
          Send a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">Choose a new password</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        For <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{email}</strong>. You&apos;ll be signed in
        straight away, and any other devices signed in to this account will be signed out.
      </p>
      <div className="mt-6">
        <ResetForm token={token} email={email} />
      </div>
    </>
  );
}

export default function ResetPasswordPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <AuthCard>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />}>
        <ResetContent searchParams={props.searchParams} />
      </Suspense>
    </AuthCard>
  );
}
