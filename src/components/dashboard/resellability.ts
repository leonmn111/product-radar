// The five resellability checks (engine/compliance.ts), in plain words. No imports, so both the
// server-side margin service and the browser can use it.

import type { ResellabilityFlags } from "@/types/dossier";

export const RESELLABILITY_LABEL: Record<keyof ResellabilityFlags, string> = {
  brandDirect: "Sold by the brand itself",
  trademarkRisk: "Brand or trademark",
  requiresUKCA: "Needs UKCA marking",
  cosmetics: "Cosmetics rules",
  batteries: "Contains a battery",
};

export const RESELLABILITY_ORDER = Object.keys(RESELLABILITY_LABEL) as (keyof ResellabilityFlags)[];

/** The checks a product fails, as "label: reason". */
export const trippedChecks = (flags: ResellabilityFlags) =>
  RESELLABILITY_ORDER.filter((k) => flags[k].value === true).map((k) => `${RESELLABILITY_LABEL[k]}: ${flags[k].reason}`);

/**
 * What a failed resale check means for a seller. "ip": a brand or trademark is involved, so wholesale
 * needs the brand's invoice and dropshipping or private label risks a store ban. "compliance": no brand
 * problem, but the goods are regulated (UKCA marking, cosmetics rules, batteries). null: no check failed.
 */
export type ResaleRisk = "ip" | "compliance" | null;

export function resaleRisk(flags: ResellabilityFlags): ResaleRisk {
  if (flags.trademarkRisk.value === true || flags.brandDirect.value === true) return "ip";
  if (flags.requiresUKCA.value === true || flags.cosmetics.value === true || flags.batteries.value === true) return "compliance";
  return null;
}

export const RISK_BADGE: Record<NonNullable<ResaleRisk>, string> = { ip: "High IP Risk", compliance: "Compliance Gated" };

/** Shown under the High IP Risk badge, word for word. */
export const IP_RISK_NOTE = "Arbitrage/Wholesale: Requires brand invoice. Dropshipping/Private Label: High risk of store ban.";

/** Shown under the Compliance Gated badge, naming the rules that apply. */
export const complianceNote = (flags: ResellabilityFlags) => {
  const rules = (["requiresUKCA", "cosmetics", "batteries"] as const).filter((k) => flags[k].value === true).map((k) => RESELLABILITY_LABEL[k].toLowerCase());
  return `Regulated goods (${rules.join(", ")}): sell only with the right UK safety marking and paperwork in place.`;
};

/** The short line under the badge where space is tight (catalog and landing cards). */
export const RISK_SHORT_NOTE: Record<NonNullable<ResaleRisk>, string> = {
  ip: IP_RISK_NOTE,
  compliance: "Regulated goods: needs the right UK safety marking and paperwork before it can be sold.",
};

// ── Warnings on premium features for a product that fails a resale check (owner's wording) ──────────

/** Above the calculator. */
export const CALCULATOR_WARNING: Record<NonNullable<ResaleRisk>, string> = {
  ip: "⚠️ HIGH IP RISK: Dropshipping this brand risks a store ban. Margins shown are for authorized wholesale only.",
  compliance: "⚠️ REGULATED GOODS: Selling without the right UK safety marking and paperwork can get listings removed. Margins shown assume a compliant supply.",
};

/** On the supplier search. */
export const SUPPLIER_WARNING: Record<NonNullable<ResaleRisk>, string> = {
  ip: "⚠️ Unauthorized Suppliers: Sourcing branded goods here carries high counterfeit risk.",
  compliance: "⚠️ Regulated goods: check each supplier's UKCA or CE marking and safety paperwork before you buy.",
};

/** The confirmation before the Shopify file downloads. */
export const EXPORT_CONFIRM: Record<NonNullable<ResaleRisk>, string> = {
  ip: "Warning: Exporting trademarked goods to your store can result in a permanent ban. Click OK to proceed anyway.",
  compliance: "Warning: Selling regulated goods without the right UK safety marking can get your listings removed. Click OK to proceed anyway.",
};
