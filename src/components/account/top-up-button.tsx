"use client";

import { useState } from "react";
import { CreditPacksModal } from "@/components/CreditPacksModal";

/** "Top up credits": opens the credit packs. */
export function TopUpButton({ balance, onSale }: { balance: number; onSale: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-md bg-accent-mint px-3 py-2 text-sm font-semibold text-on-accent shadow-sm hover:bg-accent-mint-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint"
      >
        Top up credits
      </button>
      <CreditPacksModal open={open} onClose={() => setOpen(false)} onSale={onSale} balance={balance} />
    </>
  );
}
