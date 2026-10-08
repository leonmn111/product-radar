// Authentication (Auth.js v5): passwordless email sign-in links.
// Sessions live in the database, so a user's plan (subscriptionTier) is read
// fresh on every request — an upgrade or cancellation applies immediately.

import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Resend from "next-auth/providers/resend";
import type { SubscriptionTier } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

declare module "next-auth" {
  interface Session {
    user: { id: string; tier: SubscriptionTier } & DefaultSession["user"];
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  providers: [emailProvider],
  pages: { signIn: "/signin", verifyRequest: "/signin/check-email", error: "/signin" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      session.user.tier = (user as typeof user & { subscriptionTier: SubscriptionTier }).subscriptionTier;
      return session;
    },
  },
});
