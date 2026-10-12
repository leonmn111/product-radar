import type { Metadata } from "next";
import { AuthCard } from "../auth-card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Forgot your password? — ProductRadar",
  description: "Get a link by email to choose a new ProductRadar password.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">Forgot your password?</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Enter your email and we&apos;ll send a link to choose a new one. It also works if you&apos;ve only signed in with
        email links so far.
      </p>
      <div className="mt-6">
        <ForgotForm />
      </div>
    </AuthCard>
  );
}
