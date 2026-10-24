import Link from "next/link";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { getViewer } from "@/server/auth/entitlements";
import { createDbCreditStore } from "@/server/billing/credits";
import { creditPacksOnSale } from "@/server/billing/sales";
import { AccountDropdown } from "./account-dropdown";
import { CreditBalance } from "./credit-balance";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";

async function doSignOut() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export async function AccountMenu() {
  const viewer = await getViewer();

  if (!viewer) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/signin"
          // On the narrowest phones "Get Pro" signs you in on the way, so this one can go.
          className={`rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 max-[420px]:hidden dark:text-slate-300 dark:hover:bg-white/10 ${focusRing}`}
        >
          Sign in
        </Link>
        <a
          href="/upgrade"
          className={`rounded-lg bg-accent-mint px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-background-dark shadow-sm shadow-accent-mint/20 transition hover:bg-accent-mint-strong active:scale-[0.98] motion-reduce:transition-none hover:shadow-accent-mint/30 ${focusRing}`}
        >
          Get Pro
        </a>
      </div>
    );
  }

  const isPro = viewer.tier !== "FREE";
  const balance = await createDbCreditStore(db).balance(viewer.id);
  return (
    <div className="flex items-center gap-2">
      <CreditBalance balance={balance} onSale={creditPacksOnSale()} />
      {!isPro && (
        // The one action that earns: kept in plain sight for Free accounts, not tucked in the menu.
        <a
          href="/upgrade"
          className={`rounded-lg bg-accent-mint px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-background-dark shadow-sm shadow-accent-mint/20 transition hover:bg-accent-mint-strong active:scale-[0.98] motion-reduce:transition-none hover:shadow-accent-mint/30 ${focusRing}`}
        >
          Upgrade<span className="hidden sm:inline"> to Pro</span>
        </a>
      )}
      <AccountDropdown email={viewer.email} isPro={isPro} planLabel={viewer.tier === "AGENCY" ? "Agency" : isPro ? "Pro" : "Free"} signOutAction={doSignOut} />
    </div>
  );
}
