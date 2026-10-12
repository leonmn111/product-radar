"use client";

import Link from "next/link";
import { useActionState, useId, useRef, useState, type KeyboardEvent } from "react";
import { createAccount, passwordSignIn, sendLink, type AuthFormState } from "./actions";
import { FieldError, FormError, inputClass, labelClass, PasswordInput, SubmitButton } from "./form-parts";

type Tab = "signin" | "register";

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
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`${ids}-signin-password`} className={labelClass}>
                Password
              </label>
              <Link
                href="/signin/forgot"
                className="text-xs font-medium text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-indigo-300"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput id={`${ids}-signin-password`} autoComplete="current-password" />
          </div>
          <SubmitButton pendingLabel="Signing in…" notWhile={sendLink}>
            Sign in
          </SubmitButton>
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
