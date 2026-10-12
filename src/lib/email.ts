// Transactional email through Resend — the same account that sends sign-in links.
import { env } from "@/lib/env";

export type Email = { to: string; subject: string; text: string; html: string };

/** Sends an email. Without AUTH_RESEND_KEY it's printed to the terminal in development and refused in production. */
export async function sendEmail(email: Email) {
  if (!env.AUTH_RESEND_KEY) {
    if (env.NODE_ENV === "production") throw new Error("Email isn't configured: set AUTH_RESEND_KEY.");
    console.log(`\n[email] To: ${email.to}\n[email] Subject: ${email.subject}\n\n${email.text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.AUTH_RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: email.to, subject: email.subject, text: email.text, html: email.html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
