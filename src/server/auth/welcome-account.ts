// What happens when an account is created, whichever way (a password, or a first email-link sign-in):
// it gets its free first Dossier (server/billing/welcome.ts). Sign-up never fails because of it: if the
// grant can't be made, the account simply starts with no credits and the reason is logged.

import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { STANDARD_DOSSIER_CREDITS } from "@/server/billing/plans";
import { grantWelcomeCredits } from "@/server/billing/welcome";

export async function welcomeNewAccount(userId: string): Promise<void> {
  try {
    const result = await grantWelcomeCredits(db, userId, { credits: STANDARD_DOSSIER_CREDITS.FREE, cap: env.WELCOME_DOSSIERS_PER_DAY });
    if (!result.granted && result.reason === "daily_cap") console.warn(`[welcome] today's cap (${env.WELCOME_DOSSIERS_PER_DAY}) is reached: no free Dossier for ${userId}`);
  } catch (e) {
    console.error("[welcome] couldn't grant the free first Dossier", userId, e);
  }
}
