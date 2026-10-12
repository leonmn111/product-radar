"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { requestReset, type ResetRequestState } from "../actions";
import { linkClass } from "../auth-card";
import { FieldError, FormError, inputClass, labelClass, SubmitButton } from "../form-parts";

export function ForgotForm() {
  const [state, action] = useActionState<ResetRequestState, FormData>(requestReset, {});
  const [email, setEmail] = useState("");

  if (state.sentTo) {
    return (
      <div role="status" className="space-y-4">
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-400/30">
          If there&apos;s an account for <strong className="font-semibold">{state.sentTo}</strong>, we&apos;ve emailed it a link to
          choose a new password. The link works once and expires in 1 hour.
        </p>
        <form action={action}>
          <input type="hidden" name="email" value={state.sentTo} />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Didn&apos;t get it? Check your spam folder, or send another.</p>
          <div className="mt-3">
            <SubmitButton variant="secondary" pendingLabel="Sending…">
              Send another link
            </SubmitButton>
          </div>
        </form>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/signin" className={linkClass}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <div>
        <label htmlFor="forgot-email" className={labelClass}>
          Email address
        </label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state.fieldError ? true : undefined}
          aria-describedby={state.fieldError ? "forgot-email-error" : undefined}
          className={inputClass}
        />
        <FieldError id="forgot-email-error" message={state.fieldError} />
      </div>
      <SubmitButton pendingLabel="Sending link…">Email me a reset link</SubmitButton>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Remembered it?{" "}
        <Link href="/signin" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
