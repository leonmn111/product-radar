"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setNewPassword, type AuthFormState } from "../actions";
import { linkClass } from "../auth-card";
import { FieldError, FormError, labelClass, PasswordInput, SubmitButton } from "../form-parts";

export function ResetForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(setNewPassword, {});
  const passwordError = state.fieldErrors?.password;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {state.error && (
        <div className="space-y-2">
          <FormError message={state.error} />
          <Link href="/signin/forgot" className={`text-sm ${linkClass}`}>
            Send a new link
          </Link>
        </div>
      )}
      <div>
        <label htmlFor="reset-password" className={labelClass}>
          New password
        </label>
        <PasswordInput id="reset-password" autoComplete="new-password" invalid={Boolean(passwordError)} describedBy="reset-password-hint" />
        {passwordError ? (
          <FieldError id="reset-password-hint" message={passwordError} />
        ) : (
          <p id="reset-password-hint" className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            At least 8 characters.
          </p>
        )}
      </div>
      <SubmitButton pendingLabel="Saving…">Save password and sign in</SubmitButton>
    </form>
  );
}
