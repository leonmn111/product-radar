// Transactional email through Resend (the official SDK): sign-in links, password resets, credit
// receipts and bulk-job alerts all go out from the same account.
//
// Which key: RESEND_API_KEY, else AUTH_RESEND_KEY (the one production already has).
//   no key, or a mock key ("re_mock…")  development: printed to the terminal, nothing is sent
//                                       production: refused, so a missing email is never silent
import { Resend } from "resend";
import { env } from "@/lib/env";

export type Email = { to: string; subject: string; text: string; html: string };

const isMockKey = (key: string) => key.startsWith("re_mock");

let client: Resend | null = null;
let clientKey: string | null = null;
function resend(key: string) {
  if (!client || clientKey !== key) {
    client = new Resend(key);
    clientKey = key;
  }
  return client;
}

/** Sends an email (see the key rules above). Throws if Resend refuses it. */
export async function sendEmail(email: Email) {
  const key = env.RESEND_API_KEY ?? env.AUTH_RESEND_KEY;
  if (!key || isMockKey(key)) {
    if (env.NODE_ENV === "production") throw new Error("Email isn't configured: set RESEND_API_KEY (or AUTH_RESEND_KEY) to a real Resend key.");
    console.log(`\n[email${key ? " (mock key: not sent)" : ""}] To: ${email.to}\n[email] Subject: ${email.subject}\n\n${email.text}\n`);
    return;
  }
  const { error } = await resend(key).emails.send({ from: env.EMAIL_FROM, to: email.to, subject: email.subject, text: email.text, html: email.html });
  if (error) throw new Error(`Resend refused the email: ${error.name ?? "error"}: ${String(error.message).slice(0, 200)}`);
}
