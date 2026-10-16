// Money, fee stacks, import charges, VAT and the landed margin (ARCHITECTURE.md › Landed margin
// model). Types only: the figures quoted in comments are the playbook's, and every rate used at
// runtime must arrive as cited evidence (CLAUDE.md Rules 3 and 6), never as a constant.

/** Currencies the screener prices in: GBP (UK), EUR (EU), USD (x402 / supplier quotes). */
export type Currency = "GBP" | "EUR" | "USD";

export type Money<C extends Currency = Currency> = { amount: number; currency: C };

/** Where a rate or rule comes from, so every margin line can be audited. */
export type RateSource = { evidenceIds: string[] };

/** A rate (0–1) with its source, e.g. 0.09 for 9%. */
export type SourcedRate = RateSource & { rate: number };

/** A fixed amount with its source, e.g. £0.50 per order. */
export type SourcedAmount<C extends Currency = Currency> = RateSource & { amount: Money<C> };

// ── Platform fee stacks ──────────────────────────────────────────────────────

/** TikTok Shop UK. Playbook: 9% referral + £0.50 per order + 10–20% creator commission. */
export interface TikTokShopUKFeeStack {
  channel: "tiktok_shop_uk";
  referralFee: SourcedRate; // 9%
  perOrderFee: SourcedAmount<"GBP">; // £0.50
  creatorCommission: RateSource & { min: number; max: number; applied: number | null }; // 10–20%; null = no creator sale
}

/** Amazon FBA in the UK or an EU marketplace: referral fee plus per-unit fulfilment (and storage). */
export interface AmazonFBAFeeStack {
  channel: "amazon_uk_fba" | "amazon_eu_fba";
  marketplace: string; // e.g. "amazon.co.uk", "amazon.de"
  referralFee: SourcedRate & { minimumPerItem: Money | null };
  fulfilmentFeePerUnit: SourcedAmount;
  monthlyStoragePerUnit: SourcedAmount | null; // null = not included, and named in the margin
}

/** Any other channel, as an explicit list of cited fee lines. */
export interface CustomFeeStack {
  channel: "custom";
  name: string;
  lines: (RateSource & { label: string; rate: number | null; fixed: Money | null })[];
}

export type FeeStack = TikTokShopUKFeeStack | AmazonFBAFeeStack | CustomFeeStack;

// ── Duties and VAT ───────────────────────────────────────────────────────────

/** EU import charges on a low-value parcel. Playbook: €3 customs duty + €2 handling per item. */
export interface EUImportCharges {
  customsDutyPerItem: SourcedAmount<"EUR">; // €3
  handlingFeePerItem: SourcedAmount<"EUR">; // €2
  importVat: SourcedRate & { country: string }; // the destination country's rate
}

/** UK VAT. Playbook: collected at the point of sale (by the marketplace for imports ≤ £135). */
export interface UKVat {
  rate: SourcedRate; // standard rate, e.g. 0.20
  collectedAtPointOfSale: boolean;
  sellerVatRegistered: boolean; // supplied by the caller
}

/** UK import duty for the product's commodity code, when it applies. */
export interface UKImportDuty {
  commodityCode: string | null;
  rate: SourcedRate | null; // null = not determined, and named in the margin
}

// ── Landed margin ────────────────────────────────────────────────────────────

/** How a margin line is known: sourced evidence, or a figure the caller gave us (labelled as theirs). */
export type LineBasis = "sourced" | "caller_supplied";

export type MarginLine = {
  label: string; // e.g. "TikTok Shop UK referral fee (9%)"
  amount: Money;
  basis: LineBasis;
  evidenceIds: string[]; // empty only when basis is "caller_supplied"
};

/** A component that couldn't be sourced: left out of the totals and named, never guessed. */
export type ExcludedLine = { label: string; reason: string };

/** Returns allowance: sourced return rate × the cost of handling one return. */
export type ReturnsAllowance = { returnRate: SourcedRate; costPerReturn: Money; basis: LineBasis };

/** Customer acquisition cost per sale (advertising and creators). */
export type CustomerAcquisitionCost = { perSale: Money; basis: LineBasis; evidenceIds: string[] };

export interface LandedMargin {
  market: "UK" | "EU";
  country: string; // ISO code: "GB", "DE", "FR", …
  channel: FeeStack["channel"];
  currency: Currency;

  sellingPrice: MarginLine;
  /** Supplier unit price at the quoted MOQ, freight per unit, and duties / handling. */
  landedCost: { lines: MarginLine[]; total: Money };
  /** VAT, the platform fee stack, returns allowance and CAC. */
  deductions: { lines: MarginLine[]; total: Money };

  netRevenuePerUnit: Money; // selling price − deductions
  netMarginPerUnit: Money; // net revenue − landed cost
  netMarginPct: number; // of the selling price
  returnOnCostPct: number; // net margin ÷ landed cost

  excluded: ExcludedLine[];
  evidenceIds: string[]; // every evidence item the margin rests on
}

// ── Inputs to the margin engine ──────────────────────────────────────────────

type MarginInputBase = {
  sellingPrice: SourcedAmount;
  supplierUnitCost: SourcedAmount & { moq: number };
  freightPerUnit: SourcedAmount | null;
  feeStack: FeeStack;
  returns: ReturnsAllowance | null;
  cac: CustomerAcquisitionCost | null;
};

export type UKMarginInput = MarginInputBase & { vat: UKVat; importDuty: UKImportDuty };

export type EUMarginInput = MarginInputBase & { country: string; importCharges: EUImportCharges };
