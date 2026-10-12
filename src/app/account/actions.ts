"use server";

import { refresh } from "next/cache";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { newPassword, setAccountPassword, signInLimits } from "@/server/auth/password";

export type PasswordFormState = {
  saved?: string;
  error?: string;
  fieldErrors?: { currentPassword?: string; password?: string };
};

/**
 * Sets a first password (email-link accounts) or changes the current one. Every
 * session stays signed in, unless the user ticks "sign out other devices": then
 * all sessions end and this device signs straight back in with the new password.
 */
export async function savePassword(_prev: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Your session has ended. Sign in again to change your password." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const parsed = newPassword.safeParse(String(formData.get("password") ?? ""));
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0].message } };
  const signOutOthers = formData.get("signOutOthers") === "on";

  // Checking a current password is a sign-in attempt, so it shares the sign-in form's limit.
  if (currentPassword && signInLimits.perEmail.limited(viewer.email)) {
    return { error: "Too many attempts. Please wait 15 minutes, or reset your password by email instead." };
  }

  const result = await setAccountPassword(
    db,
    viewer.id,
    { currentPassword: currentPassword || undefined, password: parsed.data },
    signOutOthers ? { endSessionsAt: new Date() } : {},
  );
  if (!result.ok) {
    switch (result.reason) {
      case "current_password_required":
        return { fieldErrors: { currentPassword: "Enter your current password." } };
      case "wrong_current_password":
        return { fieldErrors: { currentPassword: "That isn't your current password." } };
      case "changed_meanwhile":
        return { error: "Your password was just changed somewhere else. Reload the page and try again." };
      default:
        return { error: "Your session has ended. Sign in again to change your password." };
    }
  }

  if (signOutOthers) {
    // This session ended along with the others: sign this device back in. Success redirects (thrown).
    try {
      await signIn("credentials", { email: result.email, password: parsed.data, redirectTo: "/account?password=changed" });
    } catch (e) {
      if (!(e instanceof AuthError)) throw e;
      return { error: "Your password was changed and every device was signed out. Sign in again with your new password." };
    }
  }

  refresh();
  return {
    saved: result.firstPassword
      ? "Password set. You can now sign in with your email and this password, or keep using email links."
      : "Password changed. Your other devices are still signed in.",
  };
}
