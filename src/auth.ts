// Authentication (Auth.js v5): email sign-in links, or email + password.
// Sessions are signed cookies (JWT) — Auth.js requires that for passwords — but
// the session callback reads the user's plan (subscriptionTier) from the
// database on every request, so an upgrade or cancellation applies immediately.

import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import type { SubscriptionTier } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  authenticate,
  clientAddress,
  forgetUnprovenPassword,
  sessionStillValid,
  SignInInput,
  signInLimits,
} from "@/server/auth/password";

declare module "next-auth" {
  interface Session {
    user: { id: string; tier: SubscriptionTier } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    signedInAt?: number; // ms; a password change after this ends the session
  }
}

const emailProvider = Resend({
  apiKey: env.AUTH_RESEND_KEY,
  from: env.EMAIL_FROM,
  // Without a Resend key, print the link to the server terminal (development only).
  ...(env.AUTH_RESEND_KEY
    ? {}
    : {
        async sendVerificationRequest({ identifier, url }: { identifier: string; url: string }) {
          if (env.NODE_ENV === "production") {
            throw new Error("Email sign-in isn't configured: set AUTH_RESEND_KEY.");
          }
          console.log(`\n[auth] Sign-in link for ${identifier}:\n${url}\n`);
        },
      }),
});

/** Too many attempts for this address or client; the sign-in form shows its own message. */
export class SignInRateLimited extends CredentialsSignin {
  code = "rate_limited";
}

const passwordProvider = Credentials({
  credentials: { email: {}, password: {} },
  async authorize(raw, request) {
    const parsed = SignInInput.safeParse(raw);
    if (!parsed.success) return null;
    const client = clientAddress(request.headers);
    // Count every attempt (both limiters), so a locked address can't be probed from elsewhere either.
    const overClient = client !== null && signInLimits.perClient.limited(client);
    if (signInLimits.perEmail.limited(parsed.data.email) || overClient) throw new SignInRateLimited();
    return authenticate(db, parsed.data);
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [emailProvider, passwordProvider],
  pages: { signIn: "/signin", verifyRequest: "/signin/check-email", error: "/signin" },
  logger: {
    // A wrong password is an expected outcome, not a server error worth logging.
    error(error) {
      if (error instanceof CredentialsSignin) return;
      console.error(error);
    },
  },
  callbacks: {
    async signIn({ user, account, email }) {
      // An email link being used (not requested) proves the address: drop any password set before that.
      if (account?.type === "email" && !email?.verificationRequest && user.email) {
        await forgetUnprovenPassword(db, user.email);
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) token.signedInAt = Date.now(); // only at sign-in; kept as the cookie is refreshed
      return token;
    },
    async session({ session, token }) {
      // Fresh from the database on every request. A deleted account, or a session that
      // signed in before the password last changed (reset, or an unproven one dropped),
      // reads as signed out.
      const found = token.sub
        ? await db.user.findUnique({
            where: { id: token.sub },
            select: { email: true, subscriptionTier: true, passwordChangedAt: true },
          })
        : null;
      const user = found && sessionStillValid(token.signedInAt, found.passwordChangedAt) ? found : null;
      session.user.id = user ? token.sub! : "";
      session.user.email = user?.email ?? "";
      session.user.tier = user?.subscriptionTier ?? "FREE";
      return session;
    },
  },
});
