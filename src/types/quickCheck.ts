// What the homepage check (POST /api/free-verdict) returns, and the breakdown its email gate unlocks
// (POST /api/free-verdict/unlock). Types only, so the browser can use them.

import type { VerdictGate } from "./dossier";
import type { LineBasis } from "./financials";

export type QuickTier = "LAUNCH" | "TEST" | "AVOID" | "WITHHELD";

/** Where the supplier price came from: the visitor, the AliExpress link they pasted, or matched AliExpress listings. */
export type SupplierPriceSource = "you" | "aliexpress_link" | "aliexpress_matches";

export type QuickCheck = {
  /** What was pasted. */
  link: "amazon" | "aliexpress" | "tiktok";
  /** The Amazon UK product the UK selling price comes from. */
  product: { asin: string; title: string; url: string };
  /** The pasted product's own name, when it isn't that Amazon listing (an AliExpress or TikTok Shop link). */
  pastedName: string | null;
  verdict: { tier: QuickTier; gate: VerdictGate | null; label: string };
  /** Per sale, before ad spend: what's left of the UK price after VAT, fees, the creator cut and the supplier cost. Null when withheld. */
  keepPerSale: number | null;
  /** The UK selling price it's worked out at (median of the current Amazon UK listings). */
  sellingPrice: number | null;
  supplierPrice: { amount: number; source: SupplierPriceSource } | null;
  /** One line on why, for an Avoid or a withheld verdict. */
  reason: string | null;
  /** What evidence is missing, when withheld. */
  missing: string[];
  /** Signed reference to unlock the full breakdown with an email; null when there's nothing to break down. */
  unlockToken: string | null;
  fromCache: boolean;
  /** Sign up straight into the full Dossier for this product. */
  fullDossier: string;
};

export type QuickBreakdown = {
  product: { asin: string; title: string; url: string };
  sellingPrice: { amount: number; listings: number; sources: { url: string; claim: string }[] };
  /** Every cost taken from the selling price, in the margin engine's order: the supplier, VAT, the platform's fees, the creator cut. */
  lines: { label: string; amount: number; basis: LineBasis }[];
  keepPerSale: number;
  /** Costs that couldn't be sourced and aren't counted (e.g. shipping, returns). */
  notCounted: string[];
  /** The most one sale can spend on ads before it loses money (the same as keepPerSale, never below 0). */
  breakEvenAdCost: number;
  /** The highest supplier price that still breaks even before ads. */
  breakEvenSupplierPrice: number;
  worstCase: { testUnits: number; stock: number; adBudget: number; total: number };
  adTestPlan: string[];
  /** The tax and fee rules the lines follow, each linked. */
  rules: { label: string; url: string }[];
  supplierSource: { url: string; claim: string } | null;
  /** How many free breakdowns this email has left after this one. */
  freeLeft: number;
};
