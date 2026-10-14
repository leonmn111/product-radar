"use client";

import Link from "next/link";
import { useActionState } from "react";
import { linkClass } from "../signin/auth-card";
import { FieldError, FormError, labelClass, PasswordInput, SubmitButton } from "../signin/form-parts";
import { savePassword, type PasswordFormState } from "./actions";

export function PasswordForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [state, action] = useActionState<PasswordFormState, FormData>(savePassword, {});
  const currentError = state.fieldErrors?.currentPassword;
  const newError = state.fieldErrors?.password;

  return (
    <form action={action} className="max-w-md space-y-4" noValidate>
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {state.saved && (
        <p
          role="status"
          className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-400/30"
        >
          {state.saved}
        </p>
      )}
      <FormError message={state.error} />

      {hasPassword && (
        <div>
          <label htmlFor="account-current-password" className={labelClass}>
            Current password
          </label>
          <PasswordInput
            id="account-current-password"
            name="currentPassword"
            autoComplete="current-password"
            invalid={Boolean(currentError)}
            describedBy="account-current-password-hint"
          />
          {currentError ? (
            <FieldError id="account-current-password-hint" message={currentError} />
          ) : (
            <p id="account-current-password-hint" className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Forgot it?{" "}
              <Link href="/signin/forgot" className={linkClass}>
                Reset it by email
              </Link>
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="account-new-password" className={labelClass}>
          {hasPassword ? "New password" : "Password"}
        </label>
        <PasswordInput id="account-new-password" autoComplete="new-password" invalid={Boolean(newError)} describedBy="account-new-password-hint" />
        {newError ? (
          <FieldError id="account-new-password-hint" message={newError} />
        ) : (
          <p id="account-new-password-hint" className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            At least 8 characters.
          </p>
        )}
      </div>

      {hasPassword && (
        <div className="flex items-start gap-2.5">
          <input
            id="account-sign-out-others"
            name="signOutOthers"
            type="checkbox"
            aria-describedby="account-sign-out-others-hint"
            className="mt-0.5 size-4 rounded border-zinc-300 text-purple-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:border-zinc-600 dark:bg-zinc-950"
          />
          <div>
            <label htmlFor="account-sign-out-others" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Also sign out my other devices
            </label>
            <p id="account-sign-out-others-hint" className="text-xs text-zinc-600 dark:text-zinc-400">
              Tick this if you think someone else knows your old password. You&apos;ll stay signed in here.
            </p>
          </div>
        </div>
      )}

      <SubmitButton pendingLabel="Saving…">{hasPassword ? "Change password" : "Set password"}</SubmitButton>
    </form>
  );
}
