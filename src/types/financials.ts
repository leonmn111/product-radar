// Fee stacks, margin inputs and the landed margin (ARCHITECTURE.md › Landed margin model).
// All amounts are per unit and in the market's currency (GBP for the UK, EUR for the EU): the
// caller converts first, at a cited rate. Every figure says how it is known (`basis`) and which
// evidence it rests on (CLAUDE.md Rules 3 and 6).

/** Currencies the screener prices in: GBP (UK), EUR (EU), USD (x402 / supplier quotes). */
export type Currency = "GBP" | "EUR" | "USD";

export type Money<C extends Currency = Currency> = { amount: number; currency: C };

/**
 * How a figure is known:
 * - "sourced": from cited evidence (a listing, a published fee page, a tax authority);
 * - "caller_supplied": the caller's own figure (their ad cost, their return rate);
 * - "estimate": a stated default assumption (e.g. the playbook's 15% creator commission), never
 *   presented as a fact.
 */
export type LineBasis = "sourced" | "caller_supplied" | "estimate";

/** A per-unit amount in the market's currency, with how it is known. */
export type CostInput = { amount: number; basis: LineBasis; evidenceIds: string[] };

/** A rate from 0 to 1 (0.09 = 9%), with how it is known. */
export type RateInput = { rate: number; basis: LineBasis; evidenceIds: string[] };

// ── Platform fee stacks ──────────────────────────────────────────────────────

/** A percentage of the selling price, either including or excluding VAT, depending on the platform's rule. */
export type PercentFee = RateInput & { kind: "percent"; label: string; base: "price_ex_vat" | "price_inc_vat" };

/** A fixed amount per order or per unit. */
export type FixedFee = CostInput & { kind: "fixed"; label: string };

export type Fee = PercentFee | FixedFee;

/** TikTok Shop UK: referral commission, the seller-shipped order fee, and the creator (affiliate) commission. */
export interface TikTokShopUKFeeStack {
  channel: "tiktok_shop_uk";
  referral: PercentFee;
  perOrder: FixedFee | null; // null for orders TikTok fulfils
  creatorCommission: PercentFee | null; // null when there's no affiliate sale
}

/** Amazon FBA (UK or an EU marketplace): referral fee (with its per-item minimum), fulfilment and storage. */
export interface AmazonFBAFeeStack {
  channel: "amazon_uk_fba" | "amazon_eu_fba";
  marketplace: string; // e.g. "amazon.co.uk", "amazon.de"
  referral: PercentFee & { minimumPerItem: number | null };
  fulfilmentPerUnit: FixedFee;
  storagePerUnit: FixedFee | null; // null = not included, and named in the margin
}

/** Any other channel, as an explicit list of fees. */
export interface CustomFeeStack {
  channel: "custom";
  name: string;
  fees: Fee[];
}

export type FeeStack = TikTokShopUKFeeStack | AmazonFBAFeeStack | CustomFeeStack;

// ── Margin inputs ────────────────────────────────────────────────────────────

/** Returns allowance: the share of sales returned × what one return costs. */
export type ReturnsInput = { returnRate: number; costPerReturn: number; basis: LineBasis; evidenceIds: string[] };

type MarginParamsBase = {
  retailPrice: CostInput; // the consumer price, VAT included
  supplierCost: CostInput; // per unit at the quoted MOQ
  shipping: CostInput | null; // per unit to the customer; null = not quoted
  returns: ReturnsInput | null; // null = no return rate known
  adCostPerSale: CostInput | null; // CAC: advertising and creator spend per sale; null = not known
  unitsPerParcel?: number; // identical units sent together (default 1)
};

export type UKMarginParams = MarginParamsBase & {
  feeStack?: FeeStack; // default: the TikTok Shop UK stack
  vatRate?: RateInput; // default: UK standard rate, 20% (GOV.UK)
};

export type EUMarginParams = MarginParamsBase & {
  country: string; // ISO code of the destination: "DE", "FR", …
  feeStack: FeeStack;
  vatRate?: RateInput; // default: the country's standard rate, when known
  includeProposedHandlingFee?: boolean; // the €2 handling fee is proposed, not adopted (default true)
};

// ── Landed margin ────────────────────────────────────────────────────────────

export type MarginLineKind = "supplier" | "shipping" | "duty" | "handling" | "vat" | "platform_fee" | "returns" | "ad_cost";

export type MarginLine = {
  kind: MarginLineKind;
  label: string; // e.g. "TikTok Shop UK referral commission (9% of the price before VAT)"
  amount: Money;
  basis: LineBasis;
  evidenceIds: string[];
};

/** A component of the formula that couldn't be sourced: left out of the totals and named, never guessed. */
export type ExcludedLine = { kind: MarginLineKind; label: string; reason: string };

export interface LandedMargin {
  market: "UK" | "EU";
  country: string; // ISO code: "GB", "DE", …
  channel: FeeStack["channel"];
  currency: Currency;

  retailPrice: Money;
  /** Every cost taken from the retail price, in formula order. */
  lines: MarginLine[];
  totalCosts: Money;
  /** Supplier + shipping + duty + handling: what one unit costs to land. */
  landedCost: Money;

  netProfit: Money; // retail price − total costs
  netMarginPct: number; // net profit as % of the retail price
  roiPercentage: number; // net profit as % of the landed cost
  breakEvenAdCost: Money; // net profit before ad cost: the most one sale can spend on ads

  vat: { rate: number; collectedAt: "point_of_sale" | "import" };
  excluded: ExcludedLine[];
  complete: boolean; // false when any part of the formula is excluded
  evidenceIds: string[]; // every evidence item the margin rests on
}
