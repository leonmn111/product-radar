// The tax rules and default fee stack the margin engine uses, each with the evidence it rests on
// (CLAUDE.md Rule 3). A rule read from a source is "sourced"; a figure the playbook specifies but no
// source confirms is an "estimate" and labelled so wherever it is used. Checked on 2026-10-16: when a
// rule changes, update it here with its new source and date.

import type { Evidence } from "@/types/dossier";
import type { PercentFee, RateInput, TikTokShopUKFeeStack } from "@/types/financials";

const CHECKED = "2026-10-16T00:00:00.000Z";

const policy = (e: Omit<Evidence, "observedAt" | "value" | "publishedAt"> & { value: number; publishedAt?: string | null }): Evidence => ({
  observedAt: CHECKED,
  publishedAt: null,
  ...e,
});

// ── UK ───────────────────────────────────────────────────────────────────────

export const UK_VAT_EVIDENCE = policy({
  id: "policy:gov.uk:vat-standard-rate",
  provider: "gov.uk",
  sourceType: "official",
  sourceUrl: "https://www.gov.uk/vat-rates",
  quality: 95,
  claim: "The UK standard VAT rate is 20%.",
  value: 0.2,
});

export const UK_LOW_VALUE_EVIDENCE = policy({
  id: "policy:gov.uk:low-value-consignments",
  provider: "gov.uk",
  sourceType: "official",
  sourceUrl: "https://www.gov.uk/guidance/vat-and-overseas-goods-sold-directly-to-customers-in-the-uk",
  quality: 95,
  claim:
    "Consignments of goods not exceeding £135 (intrinsic value: the price paid, excluding transport, insurance and identifiable taxes) have UK supply VAT charged at the point of sale; above £135, normal import VAT and customs rules apply.",
  value: 135,
});

export const UK_VAT_STANDARD: RateInput = { rate: 0.2, basis: "sourced", evidenceIds: [UK_VAT_EVIDENCE.id] };
export const UK_LOW_VALUE_THRESHOLD_GBP = 135;

// ── EU ───────────────────────────────────────────────────────────────────────

export const EU_DUTY_EVIDENCE = policy({
  id: "policy:eu:fixed-customs-duty-3eur",
  provider: "apc-pli.com (reporting the EU Council decision)",
  sourceType: "official",
  sourceUrl: "https://www.apc-pli.com/service-alerts/eu-fixed-customs-duty",
  quality: 75,
  claim:
    "From 1 July 2026 the EU charges a fixed €3 customs duty on parcels valued under €150, per individual item within a shipment based on tariff classification, for goods from non-EU sellers registered under IOSS.",
  value: 3,
  publishedAt: "2025-12-19T00:00:00.000Z",
});

export const EU_HANDLING_FEE_EVIDENCE = policy({
  id: "policy:eu:proposed-handling-fee",
  provider: "apc-pli.com (reporting the EU Council)",
  sourceType: "official",
  sourceUrl: "https://www.apc-pli.com/service-alerts/eu-fixed-customs-duty",
  quality: 50,
  claim:
    "A separate EU customs handling fee is being discussed as part of broader customs reform; it is not adopted. The €2 per item used here is the playbook's figure.",
  value: 2,
  publishedAt: "2025-12-19T00:00:00.000Z",
});

export const EU_VAT_EVIDENCE = policy({
  id: "policy:ec:tedb-standard-vat-rates",
  provider: "European Commission (Taxes in Europe Database)",
  sourceType: "official",
  sourceUrl: "https://ec.europa.eu/taxation_customs/tedb/",
  quality: 90,
  claim: "Standard VAT rates applied by EU Member States, as recorded in the Commission's Taxes in Europe Database.",
  value: 0,
});

export const EU_LOW_VALUE_THRESHOLD_EUR = 150;
export const EU_FIXED_DUTY_EUR = 3; // per item type in a parcel ≤ €150
export const EU_HANDLING_FEE_EUR = 2; // per item; proposed, not adopted

/** Standard VAT rates of the first EU markets (TEDB). Any other country must be given its rate explicitly. */
export const EU_STANDARD_VAT: Record<string, number> = {
  AT: 0.2,
  BE: 0.21,
  DE: 0.19,
  ES: 0.21,
  FR: 0.2,
  IE: 0.23,
  IT: 0.22,
  NL: 0.21,
  PL: 0.23,
  SE: 0.25,
};

// ── TikTok Shop UK default stack ─────────────────────────────────────────────

export const TIKTOK_UK_REFERRAL_EVIDENCE = policy({
  id: "policy:tiktok-shop-uk:referral-9pct",
  provider: "getonecart.com (TikTok Shop seller fees, 17 April 2026)",
  sourceType: "other",
  sourceUrl: "https://www.getonecart.com/tiktok-shop-seller-fees/",
  quality: 60,
  claim:
    "TikTok Shop UK's standard referral commission is 9% (5% for selected Electronics & Beauty categories), charged on the item subtotal excluding shipping and VAT. Third-party summary: confirm in TikTok Seller Center.",
  value: 0.09,
  publishedAt: "2026-04-17T00:00:00.000Z",
});

const referral: PercentFee = {
  kind: "percent",
  label: "TikTok Shop UK referral commission (9% of the price before VAT)",
  rate: 0.09,
  base: "price_ex_vat",
  basis: "sourced",
  evidenceIds: [TIKTOK_UK_REFERRAL_EVIDENCE.id],
};

/**
 * The playbook's default TikTok Shop UK stack: 9% referral + £0.50 self-ship order fee + 15% creator
 * commission. Only the 9% is sourced; the £0.50 fee is unconfirmed and the 15% is an estimate inside
 * the usual 10–20% range, so both are labelled "estimate". Pass your own stack to replace any of it.
 */
export const TIKTOK_SHOP_UK_DEFAULT_STACK: TikTokShopUKFeeStack = {
  channel: "tiktok_shop_uk",
  referral,
  perOrder: { kind: "fixed", label: "TikTok Shop UK self-ship order fee (£0.50, unconfirmed)", amount: 0.5, basis: "estimate", evidenceIds: [] },
  creatorCommission: {
    kind: "percent",
    label: "Creator commission (15% estimate; deals usually run 10–20%)",
    rate: 0.15,
    base: "price_ex_vat",
    basis: "estimate",
    evidenceIds: [],
  },
};

/** Every policy evidence item, for a Dossier's EvidenceList. */
export const POLICY_EVIDENCE: Evidence[] = [
  UK_VAT_EVIDENCE,
  UK_LOW_VALUE_EVIDENCE,
  EU_DUTY_EVIDENCE,
  EU_HANDLING_FEE_EVIDENCE,
  EU_VAT_EVIDENCE,
  TIKTOK_UK_REFERRAL_EVIDENCE,
];
