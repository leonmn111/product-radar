import Link from "next/link";
import { signOut } from "@/auth";
import { getViewer } from "@/server/auth/entitlements";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400";

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
          className={`rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 ${focusRing}`}
        >
          Sign in
        </Link>
        <a
          href="/upgrade"
          className={`rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:text-zinc-950 dark:hover:bg-indigo-400 ${focusRing}`}
        >
          Get Pro
        </a>
      </div>
    );
  }

  const isPro = viewer.tier !== "FREE";
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <span className="max-w-[16ch] truncate sm:max-w-[28ch]" title={viewer.email}>
          {viewer.email}
        </span>
        <span
          className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
            isPro
              ? "bg-indigo-50 text-indigo-800 ring-indigo-600/20 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-400/30"
              : "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20"
          }`}
        >
          {isPro ? "Pro" : "Free"}
        </span>
      </span>
      {isPro ? (
        <a
          href="/billing/manage"
          className={`rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800 ${focusRing}`}
        >
          Billing
        </a>
      ) : (
        <a
          href="/upgrade"
          className={`rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:text-zinc-950 dark:hover:bg-indigo-400 ${focusRing}`}
        >
          Upgrade to Pro
        </a>
      )}
      <form action={doSignOut}>
        <button
          type="submit"
          className={`rounded-md px-2 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white ${focusRing}`}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
