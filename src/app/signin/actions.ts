"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { appUrl, originFromHeaders } from "@/lib/app-url";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  clientAddress,
  EmailInput,
  newPassword,
  RegisterInput,
  registerLimits,
  registerUser,
  signInLimits,
} from "@/server/auth/password";
import { requestPasswordReset, resetLimits, resetPassword } from "@/server/auth/password-reset";
import { safeCallback } from "./callback-url";

export type AuthFormState = {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
};

const fields = (formData: FormData) => ({
  email: String(formData.get("email") ?? ""),
  password: String(formData.get("password") ?? ""),
  callbackUrl: safeCallback(formData.get("callbackUrl")),
});

/** Signs in with the password provider; on success Auth.js redirects (a thrown redirect, passed through). */
async function signInWithPassword(email: string, password: string, callbackUrl: string): Promise<AuthFormState> {
  try {
    await signIn("credentials", { email, password, redirectTo: callbackUrl });
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    if (e.type === "CredentialsSignin" && "code" in e && e.code === "rate_limited") {
      return { error: "Too many sign-in attempts. Please wait 15 minutes, or use an email link instead." };
    }
    return { error: "That email and password don't match. Check them, or use an email link instead." };
  }
  return {};
}

export async function passwordSignIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password, callbackUrl } = fields(formData);
  if (!email.trim() || !password) return { error: "Enter your email and password." };
  return signInWithPassword(email, password, callbackUrl);
}

export async function createAccount(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { callbackUrl, ...input } = fields(formData);
  const parsed = RegisterInput.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { email: errors.email?.[0], password: errors.password?.[0] } };
  }
  const client = clientAddress(await headers());
  if (client && registerLimits.perClient.limited(client)) {
    return { error: "Too many accounts created from this connection. Please try again in an hour." };
  }
  const result = await registerUser(db, parsed.data);
  if (!result.ok) {
    return {
      fieldErrors: { email: "An account with this email already exists. Sign in instead, or use an email link." },
    };
  }
  return signInWithPassword(parsed.data.email, parsed.data.password, callbackUrl);
}

// Stops the email-link form being used to flood someone's inbox (or burn the email quota).
const linkPerEmail = createRateLimiter({ windowMs: 15 * 60_000, max: 3 });
const linkPerClient = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });

export async function sendLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const callbackUrl = safeCallback(formData.get("callbackUrl"));
  const back = (error: string) => `/signin?error=${encodeURIComponent(error)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(back("InvalidEmail"));
  // Per-client limiting only when the host tells us who the client is — otherwise
  // every visitor would share one bucket and could lock each other out.
  const client = clientAddress(await headers());
  if ((client && linkPerClient.limited(client)) || linkPerEmail.limited(email)) redirect(back("RateLimited"));
  // redirect:false returns the URL Auth.js would redirect to — an error page if sending failed.
  const next = await signIn("resend", { email, redirectTo: callbackUrl, redirect: false });
  const error = typeof next === "string" ? new URL(next, "http://x").searchParams.get("error") : null;
  redirect(error ? back(error) : "/signin/check-email");
}

export type ResetRequestState = { sentTo?: string; error?: string; fieldError?: string };

/** "Forgot password": emails a reset link. The reply is the same whether or not the account exists. */
export async function requestReset(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const parsed = EmailInput.safeParse(String(formData.get("email") ?? ""));
  if (!parsed.success) return { fieldError: "Enter a valid email address." };
  const email = parsed.data;
  const h = await headers();
  const client = clientAddress(h);
  if ((client && resetLimits.perClient.limited(client)) || resetLimits.perEmail.limited(email)) {
    return { error: "Too many reset emails requested. Please wait 15 minutes and try again." };
  }
  const baseUrl = appUrl(originFromHeaders(h) ?? "");
  try {
    if (!baseUrl) throw new Error("No site address: set APP_URL.");
    await requestPasswordReset(db, email, { baseUrl, send: sendEmail });
  } catch (e) {
    console.error("[auth] password reset email failed", e);
    return { error: "We couldn't send the email just now. Please try again in a few minutes." };
  }
  return { sentTo: email };
}

/** Sets the password from a reset link, then signs in with it. */
export async function setNewPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const parsed = newPassword.safeParse(String(formData.get("password") ?? ""));
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0].message } };
  const result = await resetPassword(db, token, parsed.data);
  if (!result.ok) return { error: "This link has expired or was already used. Request a new one below." };
  // The link proved the address, so earlier wrong-password attempts no longer lock it.
  signInLimits.perEmail.reset(result.email);
  return signInWithPassword(result.email, parsed.data, "/");
}

