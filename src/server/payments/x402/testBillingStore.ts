// Tests only: the BillingStore contract in memory (usage rows, settlements, one in flight per wallet).

import type { BillingStore, Claimed, InFlight } from "./usageBilling";

const NOW = new Date("2026-11-05T03:00:00.000Z");

export function memoryBillingStore(wallets: Record<string, string>) {
  type Usage = { walletId: string; amount: bigint; settlementId: string | null };
  type Sett = { id: string; walletId: string; amount: bigint; status: "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED"; signature: string | null; lvbh: bigint | null; createdAt: Date; error?: string };
  const usage: Usage[] = [];
  const settlements: Sett[] = [];
  let n = 0;
  const inFlight = (w: string) => settlements.some((x) => x.walletId === w && (x.status === "PENDING" || x.status === "SUBMITTED"));
  const store: BillingStore & { usage: Usage[]; settlements: Sett[] } = {
    usage,
    settlements,
    async walletId(address) {
      return Object.entries(wallets).find(([, a]) => a === address)?.[0] ?? null;
    },
    async owed(walletId) {
      const u = usage.filter((x) => x.walletId === walletId && !x.settlementId).reduce((t, x) => t + x.amount, BigInt(0));
      return u + settlements.filter((x) => x.walletId === walletId && (x.status === "PENDING" || x.status === "SUBMITTED")).reduce((t, x) => t + x.amount, BigInt(0));
    },
    async recordUsage(u) {
      usage.push({ walletId: u.walletId, amount: u.amountMicros, settlementId: null });
      return usage.filter((x) => x.walletId === u.walletId && !x.settlementId).reduce((t, x) => t + x.amount, BigInt(0));
    },
    async claim(walletId): Promise<Claimed | null> {
      if (inFlight(walletId)) return null;
      const mine = usage.filter((x) => x.walletId === walletId && !x.settlementId);
      if (!mine.length) return null;
      const id = `s${++n}`;
      mine.forEach((x) => (x.settlementId = id));
      const amount = mine.reduce((t, x) => t + x.amount, BigInt(0));
      settlements.push({ id, walletId, amount, status: "PENDING", signature: null, lvbh: null, createdAt: NOW });
      return { id, walletId, address: wallets[walletId], amountMicros: amount };
    },
    async markSubmitted(id, signature, lvbh) {
      Object.assign(settlements.find((x) => x.id === id)!, { status: "SUBMITTED", signature, lvbh });
    },
    async markConfirmed(id) {
      settlements.find((x) => x.id === id)!.status = "CONFIRMED";
    },
    async markFailed(id, error) {
      Object.assign(settlements.find((x) => x.id === id)!, { status: "FAILED", error });
      usage.filter((x) => x.settlementId === id).forEach((x) => (x.settlementId = null));
    },
    async inFlight(): Promise<InFlight[]> {
      return settlements
        .filter((x) => x.status === "PENDING" || x.status === "SUBMITTED")
        .map((x) => ({ id: x.id, walletId: x.walletId, signature: x.signature, lastValidBlockHeight: x.lvbh, createdAt: x.createdAt }));
    },
    async walletsWithUnsettled() {
      return [...new Set(usage.filter((x) => !x.settlementId).map((x) => x.walletId))];
    },
  };
  return store;
}

