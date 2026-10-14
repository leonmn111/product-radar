import Link from "next/link";
import { signOut } from "@/auth";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getViewer } from "@/server/auth/entitlements";
import { AccountDropdown } from "./account-dropdown";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";

async function doSignOut() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export async function AccountMenu() {
  const viewer = await getViewer();

  if (!viewer) {
    return (
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link
          href="/signin"
          // On the narrowest phones "Get Pro" signs you in on the way, so this one can go.
          className={`rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 max-[420px]:hidden dark:text-zinc-300 dark:hover:bg-white/10 ${focusRing}`}
        >
          Sign in
        </Link>
        <a
          href="/upgrade"
          className={`rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-white shadow-sm shadow-purple-600/25 transition hover:bg-purple-700 active:scale-[0.98] motion-reduce:transition-none dark:hover:bg-purple-600 dark:hover:shadow-purple-500/40 ${focusRing}`}
        >
          Get Pro
        </a>
      </div>
    );
  }

  const isPro = viewer.tier !== "FREE";
  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      {!isPro && (
        // The one action that earns: kept in plain sight for Free accounts, not tucked in the menu.
        <a
          href="/upgrade"
          className={`rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-white shadow-sm shadow-purple-600/25 transition hover:bg-purple-700 active:scale-[0.98] motion-reduce:transition-none dark:hover:bg-purple-600 dark:hover:shadow-purple-500/40 ${focusRing}`}
        >
          Upgrade<span className="hidden sm:inline"> to Pro</span>
        </a>
      )}
      <AccountDropdown email={viewer.email} isPro={isPro} signOutAction={doSignOut} />
    </div>
  );
}
