// The verdict scale and its hard gates (CLAUDE.md Rules 5 and 7), shared by every verdict ProductRadar
// gives: the catalog dossier (components/dashboard/dossier.ts), the paid Dossier (services/dossierService.ts),
// the free check and the APIs. Pure, with no runtime imports, so the browser can use it too.
//
//   Launch               strong evidence and a proven profit, every cost accounted for
//   Test small           worth a small trial order: nothing argues against it, but the profit isn't proven
//   Avoid                a hard gate failed, or the evidence argues against it
//   Not enough evidence  below the 0.5 verdict gate: withheld, with what's missing
//
// Two hard gates decide before anything else, whatever the scores say:
//   G3 Brand/IP  a brand or trademark is involved (High IP Risk), or the seller is the brand itself →
//                "Avoid (brand-restricted)", and no supplier links are shown anywhere for the product.
//                Checked first, even below the verdict gate: it reads the product's own listing text, so
//                it's a recorded check, not an estimate from thin evidence.
//   G1 Profit    the contribution before ads (the price less VAT, fees, the supplier cost and every other
//                sourced cost, before any ad spend) is £0 or less on the cheapest modelled channel →
//                "Avoid", with the reason "Loses £X per sale before ads".

import type { ResellabilityFlags, VerdictGate, VerdictKind } from "@/types/dossier";
import type { LandedMargin, Money } from "@/types/financials";

/** The verdict a product gets, or WITHHELD ("Not enough evidence") below the verdict gate. */
export type VerdictTier = VerdictKind | "WITHHELD";

/** The hard gate behind an Avoid, when one decided it. */
export type HardGate = VerdictGate;

export const VERDICT_LABEL: Record<VerdictTier, string> = {
  LAUNCH: "Launch",
  TEST: "Test small",
  AVOID: "Avoid",
  WITHHELD: "Not enough evidence",
};
export const BRAND_RESTRICTED_LABEL = "Avoid (brand-restricted)";

/** What a verdict is called on screen: "Avoid (brand-restricted)" when G3 decided it. */
export const verdictLabel = (tier: VerdictTier, gate: HardGate | null = null) => (tier === "AVOID" && gate === "G3_BRAND" ? BRAND_RESTRICTED_LABEL : VERDICT_LABEL[tier]);

/** G3: a brand or trademark is involved, or the seller is the brand itself. */
export const brandRestricted = (flags: ResellabilityFlags) => flags.trademarkRisk.value === true || flags.brandDirect.value === true;

/** Why a G3 Avoid: the same words wherever it's shown. */
export const BRAND_RESTRICTED_REASON =
  "Brand-restricted: a brand or trademark is involved, so reselling it needs the brand's invoice, and dropshipping or private label risks a store ban. ProductRadar shows no suppliers for it.";

/** Launch needs at least this net margin (% of the price) and return on landed cost, every cost accounted for. */
export const LAUNCH_MIN_MARGIN_PCT = 25;
export const LAUNCH_MIN_ROI_PCT = 50;

type ChannelMargin = Pick<LandedMargin, "channel" | "currency" | "retailPrice" | "breakEvenAdCost" | "netProfit" | "netMarginPct" | "roiPercentage" | "complete">;

const SYMBOL: Record<Money["currency"], string> = { GBP: "£", EUR: "€", USD: "$" };
const amount = (m: Money) => `${m.amount < 0 ? "−" : ""}${SYMBOL[m.currency]}${Math.abs(m.amount).toFixed(2)}`;

/**
 * The cheapest channel to sell on: the one that keeps the most per sale before ads. Every channel must be
 * in the same market (one currency). Null when no channel is modelled.
 */
export function cheapestChannel<M extends ChannelMargin>(channels: M[]): M | null {
  return channels.reduce<M | null>((best, m) => (!best || m.breakEvenAdCost.amount > best.breakEvenAdCost.amount ? m : best), null);
}

/**
 * G1: on the cheapest modelled channel, the contribution before ads is £0 or less. Returns that channel and
 * the reason ("Loses £X per sale before ads"), or null when it makes money (or no channel is modelled).
 */
export function profitGate<M extends ChannelMargin>(channels: M[]): { margin: M; reason: string } | null {
  const best = cheapestChannel(channels);
  if (!best || best.breakEvenAdCost.amount > 0) return null;
  const loss = { amount: -best.breakEvenAdCost.amount, currency: best.breakEvenAdCost.currency };
  return { margin: best, reason: `Loses ${amount(loss)} per sale before ads` };
}

/** Launch-ready: every cost accounted for, and the margin and return clear the Launch thresholds. */
export const launchReady = (m: ChannelMargin) => m.complete && m.netProfit.amount > 0 && m.netMarginPct >= LAUNCH_MIN_MARGIN_PCT && m.roiPercentage >= LAUNCH_MIN_ROI_PCT;

/** "£4.20 before ads per sale (21.0% of the price)": the contribution, for reasons. */
export const contributionText = (m: ChannelMargin) =>
  `${amount(m.breakEvenAdCost)} per sale before ads (${((m.breakEvenAdCost.amount / m.retailPrice.amount) * 100).toFixed(1)}% of the price)`;
