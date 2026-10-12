"use client";

import { useActionState, useId, useRef, useState, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { createAccount, passwordSignIn, sendLink, type AuthFormState } from "./actions";

type Tab = "signin" | "register";

const inputClass =
  "mt-1 w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-300 ring-inset placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 aria-invalid:ring-red-600 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700 dark:aria-invalid:ring-red-400";
const labelClass = "block text-sm font-medium text-zinc-900 dark:text-zinc-100";
const primaryClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-indigo-500 dark:text-zinc-950 dark:hover:bg-indigo-400";
const secondaryClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800";

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

/** A submit button that shows a spinner while its own action (not another button's) runs. */
function SubmitButton({
  children,
  pendingLabel,
  formAction,
  variant = "primary",
}: {
  children: string;
  pendingLabel: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  variant?: "primary" | "secondary";
}) {
  const status = useFormStatus();
  const mine = status.pending && (formAction ? status.action === formAction : status.action !== sendLink);
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

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-sm text-red-700 dark:text-red-300">
      {message}
    </p>
  ) : null;
}

function FormError({ message }: { message?: string | null }) {
  return message ? (
    <p
      role="alert"
      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-600/20 ring-inset dark:bg-red-950/30 dark:text-red-200 dark:ring-red-400/30"
    >
      {message}
    </p>
  ) : null;
}

function PasswordInput({ id, autoComplete, invalid, describedBy }: { id: string; autoComplete: string; invalid?: boolean; describedBy?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name="password"
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
        className="absolute inset-y-0 right-0 mt-1 rounded-r-md px-3 text-xs font-semibold text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        {shown ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}

export function AuthPanel({ callbackUrl, initialTab, linkError }: { callbackUrl: string; initialTab: Tab; linkError: string | null }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [email, setEmail] = useState(""); // shared by both tabs, and kept when a form resets after an error
  const [signInState, signInAction] = useActionState<AuthFormState, FormData>(passwordSignIn, {});
  const [registerState, registerAction] = useActionState<AuthFormState, FormData>(createAccount, {});
  const ids = useId();
  const tabRefs = { signin: useRef<HTMLButtonElement>(null), register: useRef<HTMLButtonElement>(null) };

  const tabs: { key: Tab; label: string }[] = [
    { key: "signin", label: "Sign in" },
    { key: "register", label: "Create account" },
  ];
  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onTabKey(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next: Tab = tab === "signin" ? "register" : "signin";
    setTab(next);
    tabRefs[next].current?.focus();
  }

  const emailField = (formId: string, error?: string) => (
    <div>
      <label htmlFor={`${formId}-email`} className={labelClass}>
        Email address
      </label>
      <input
        id={`${formId}-email`}
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${formId}-email-error` : undefined}
        className={inputClass}
      />
      <FieldError id={`${formId}-email-error`} message={error} />
    </div>
  );

  return (
    <div>
      <div role="tablist" aria-label="Sign in or create an account" className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={tabRefs[t.key]}
            type="button"
            role="tab"
            id={`${ids}-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`${ids}-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            onKeyDown={onTabKey}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 aria-selected:bg-white aria-selected:text-zinc-950 aria-selected:shadow-sm dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-selected:bg-zinc-950 dark:aria-selected:text-white"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${ids}-panel-signin`} aria-labelledby={`${ids}-tab-signin`} hidden={tab !== "signin"} className="mt-6">
        <form action={signInAction} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <FormError message={signInState.error ?? linkError} />
          {emailField(`${ids}-signin`)}
          <div>
            <label htmlFor={`${ids}-signin-password`} className={labelClass}>
              Password
            </label>
            <PasswordInput id={`${ids}-signin-password`} autoComplete="current-password" />
          </div>
          <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400" aria-hidden>
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
            or
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          </div>
          <SubmitButton formAction={sendLink} variant="secondary" pendingLabel="Sending link…">
            Email me a sign-in link
          </SubmitButton>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">No password? The link signs you in, and creates an account if you&apos;re new.</p>
        </form>
      </div>

      <div role="tabpanel" id={`${ids}-panel-register`} aria-labelledby={`${ids}-tab-register`} hidden={tab !== "register"} className="mt-6">
        <form action={registerAction} className="space-y-4" noValidate>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <FormError message={registerState.error} />
          {emailField(`${ids}-register`, registerState.fieldErrors?.email)}
          <div>
            <label htmlFor={`${ids}-register-password`} className={labelClass}>
              Password
            </label>
            <PasswordInput
              id={`${ids}-register-password`}
              autoComplete="new-password"
              invalid={Boolean(registerState.fieldErrors?.password)}
              describedBy={`${ids}-register-password-hint`}
            />
            {registerState.fieldErrors?.password ? (
              <FieldError id={`${ids}-register-password-hint`} message={registerState.fieldErrors.password} />
            ) : (
              <p id={`${ids}-register-password-hint`} className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                At least 8 characters.
              </p>
            )}
          </div>
          <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Free to create. No card needed.</p>
        </form>
      </div>
    </div>
  );
}
