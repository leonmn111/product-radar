"use client";

import { useState } from "react";
import { CreditPacksModal } from "@/components/CreditPacksModal";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";

/** The header's credit balance; it opens the credit packs. While the free first Dossier is unused, it says so. */
export function CreditBalance({ balance, onSale, freeDossier = false }: { balance: number; onSale: boolean; freeDossier?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-100 dark:text-slate-200 dark:ring-white/15 dark:hover:bg-white/10 ${focusRing}`}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 text-amber-500 dark:text-amber-400">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12.5a.75.75 0 0 1 .75.75v.3c.93.2 1.75.82 1.75 1.95a.75.75 0 0 1-1.5 0c0-.3-.34-.75-1-.75s-1 .45-1 .75.2.6 1.17.84c1.2.3 2.33.83 2.33 2.16 0 1.13-.82 1.75-1.75 1.95v.3a.75.75 0 0 1-1.5 0v-.3c-.93-.2-1.75-.82-1.75-1.95a.75.75 0 0 1 1.5 0c0 .3.34.75 1 .75s1-.45 1-.75-.2-.6-1.17-.84C8.63 10.4 7.5 9.87 7.5 8.5c0-1.13.82-1.75 1.75-1.95v-.3A.75.75 0 0 1 10 5.5Z" clipRule="evenodd" />
        </svg>
        <span className="font-mono font-semibold text-slate-950 tabular-nums dark:text-white">{balance}</span>
        <span>
          <span className="max-sm:sr-only">credit{balance === 1 ? "" : "s"}</span>
          <span className="sr-only">: buy more</span>
        </span>
        {freeDossier && (
          <span className="ml-1 rounded-full bg-accent-mint/15 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-accent-mint ring-1 ring-accent-mint/30 ring-inset max-sm:hidden">
            1 free Dossier
          </span>
        )}
      </button>
      <CreditPacksModal open={open} onClose={() => setOpen(false)} onSale={onSale} balance={balance} />
    </>
  );
}
