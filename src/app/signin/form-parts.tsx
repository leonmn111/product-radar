"use client";

// Form building blocks shared by the sign-in, forgot-password, reset-password and account screens.

import { useState } from "react";
import { useFormStatus } from "react-dom";

export const inputClass =
  "mt-1 w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint aria-invalid:ring-red-600 dark:bg-background-dark dark:text-slate-100 dark:ring-line-dark dark:aria-invalid:ring-red-400";
export const labelClass = "block text-sm font-medium text-slate-900 dark:text-slate-100";
const primaryClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-mint px-4 py-2 text-sm font-semibold text-background-dark shadow-sm hover:bg-accent-mint-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint disabled:cursor-not-allowed disabled:opacity-70";
const secondaryClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-300 ring-inset hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint disabled:cursor-not-allowed disabled:opacity-70 dark:bg-surface-dark dark:text-slate-100 dark:ring-line-dark dark:hover:bg-surface-raised";

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

type FormFn = (formData: FormData) => void | Promise<void>;

/**
 * A submit button that shows a spinner while its own action runs. `formAction`
 * overrides the form's action for this button; `notWhile` is another button's
 * action that shouldn't make this one spin.
 */
export function SubmitButton({
  children,
  pendingLabel,
  formAction,
  notWhile,
  variant = "primary",
}: {
  children: string;
  pendingLabel: string;
  formAction?: FormFn;
  notWhile?: FormFn;
  variant?: "primary" | "secondary";
}) {
  const status = useFormStatus();
  const mine = status.pending && (formAction ? status.action === formAction : status.action !== notWhile);
  return (
    <button
      type="submit"
      formAction={formAction}
      formNoValidate={formAction ? true : undefined}
      disabled={status.pending}
      className={variant === "primary" ? primaryClass : secondaryClass}
    >
      {mine && <Spinner />}
      {mine ? pendingLabel : children}
    </button>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-sm text-red-700 dark:text-red-300">
      {message}
    </p>
  ) : null;
}

export function FormError({ message }: { message?: string | null }) {
  return message ? (
    <p
      role="alert"
      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-600/20 ring-inset dark:bg-red-950/30 dark:text-red-200 dark:ring-red-400/30"
    >
      {message}
    </p>
  ) : null;
}

export function PasswordInput({
  id,
  name = "password",
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string;
  name?: string;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        required
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${inputClass} pr-16`}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 mt-1 rounded-r-md px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-mint dark:text-slate-400 dark:hover:text-slate-100"
      >
        {shown ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}
