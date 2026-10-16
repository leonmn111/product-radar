// The 8-part Dossier (ARCHITECTURE.md › The product). Types only.
//
//   1 Verdict          gated at 0.5 confidence     5 Saturation        gated at 0.7
//   2 Resellability    each flag with evidence     6 SupplierMatches   top 3, each cited
//   3 LandedMargin     gated at 0.7                7 EvidenceList      every item used
//   4 Momentum         gated at 0.7                8 Exports           built from shown parts only
//
// A gated part is `Gated<T>`: its value exists only together with a confidence that cleared the
// part's gate (CLAUDE.md Rule 5); otherwise it is withheld with the evidence still missing.

import type { Currency, LandedMargin, Money } from "./financials";

/** Part 3: the margin in each market the evidence covers (EU only when there are EU listings). */
export type LandedMargins = { uk: LandedMargin; eu: LandedMargin | null };

// ── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceSourceType = "marketplace" | "supplier" | "official" | "ads_library" | "trend" | "review" | "other";

/** One sourced, timestamped, quality-scored fact (CLAUDE.md Rule 3). */
export interface Evidence {
  id: string; // stable per source item, e.g. "rainforest:amazon.co.uk:B0CH33F5P2"
  provider: string; // e.g. "rainforest", "keepa", "aliexpress", "meta_ad_library", "gov.uk"
  sourceType: EvidenceSourceType;
  sourceUrl: string; // what a reader can open
  observedAt: string; // ISO time the fact was read
  publishedAt: string | null; // when the source published it, if it says
  quality: number; // 0–100, by how the fact was obtained
  claim: string; // the fact, in words
  value: number | string | boolean | null; // the extracted value, when there is one
  matchScore?: number | null; // 0–1 for supplier evidence: how closely the listing's title matches the product
  imageMatch?: ImageMatchEvidence | null; // supplier evidence: how closely its image matches the product's
}

/** A supplier image compared with the product's image (the evidence item `comparedWith`). */
export interface ImageMatchEvidence {
  score: number; // 0–1
  method: "simulated"; // how it was measured; "simulated" is development-only and never in a real Dossier
  comparedWith: string; // evidence id of the product listing whose image it was compared with
}

/** Part 7: every evidence item the Dossier uses, in one auditable list. */
export type EvidenceList = Evidence[];

// ── Gating ───────────────────────────────────────────────────────────────────

/** Why a part is withheld: too little evidence for its gate, or a product that can't be resold. */
export type WithheldReason = "Insufficient Data" | "Not Sellable";

export type Gated<T> =
  | { status: "shown"; confidence: number; value: T; evidenceIds: string[] }
  | { status: "withheld"; reason: WithheldReason; confidence: number; missing: string[] };

// ── Part 1: Verdict ──────────────────────────────────────────────────────────

export type VerdictKind = "LAUNCH" | "TEST" | "AVOID";

export interface Verdict {
  kind: VerdictKind;
  reasons: string[]; // plain-words reasons, each backed by the parts it cites
}

// ── Part 2: Resellability ────────────────────────────────────────────────────

/** A compliance flag: true when tripped, false when checked and clear, null when it couldn't be checked. */
export type ComplianceFlag = { value: boolean | null; reason: string; evidenceIds: string[] };

export interface ResellabilityFlags {
  brandDirect: ComplianceFlag; // the seller is the brand itself
  trademarkRisk: ComplianceFlag; // a brand or trademark is involved
  requiresUKCA: ComplianceFlag; // electronics or toys: needs UKCA (GB) / CE (EU) conformity marking
  cosmetics: ComplianceFlag; // cosmetics rules apply
  batteries: ComplianceFlag; // contains or is a battery
}

// ── Part 4: Momentum ─────────────────────────────────────────────────────────

export interface Momentum {
  trendSlope12w: number; // change per week over the last 12 weeks (index points or units)
  salesVelocity: { unitsPerMonth: number; method: string }; // how it was measured
  adDurationDays: number | null; // longest-running active ad; null = no ad data
}

// ── Part 5: Saturation ───────────────────────────────────────────────────────

export interface Saturation {
  sellerCount: number; // sellers listing the same product
  storeCount: number; // distinct stores / marketplaces
  adDensity: number | null; // active ads per seller; null = no ad data
}

// ── Part 6: Supplier matches ─────────────────────────────────────────────────

export interface SupplierMatch {
  platform: "1688" | "aliexpress";
  listingUrl: string;
  title: string;
  unitPrice: Money;
  moq: number | null; // minimum order quantity; null = the listing doesn't state one
  deliveryDays: { min: number; max: number } | null; // to the target market; null = not quoted
  matchScore: number; // 0–1, image + title similarity
  evidenceIds: string[];
}

/** The best matches first, at most three. */
export type SupplierMatches = [] | [SupplierMatch] | [SupplierMatch, SupplierMatch] | [SupplierMatch, SupplierMatch, SupplierMatch];

// ── Part 8: Exports ──────────────────────────────────────────────────────────

export interface Exports {
  shopifyCsvUrl: string | null; // null until the parts it needs are shown
  pdfUrl: string | null;
  shareLink: string | null;
}

// ── The Dossier ──────────────────────────────────────────────────────────────

export interface DossierProduct {
  title: string;
  query: string; // what the caller searched for
  market: "UK" | "EU";
  country: string; // ISO code
  currency: Currency;
  identifiers: { asin?: string; gtin?: string; supplierIds?: string[] };
}

export interface Dossier {
  id: string;
  generatedAt: string; // ISO
  product: DossierProduct;
  sample: boolean; // true only for development sample data; never in production
  notes: string[]; // source problems and what isn't covered yet, in plain words

  verdict: Gated<Verdict>; // 1, gate 0.5
  resellability: ResellabilityFlags; // 2
  landedMargin: Gated<LandedMargins>; // 3, gate 0.7
  momentum: Gated<Momentum>; // 4, gate 0.7
  saturation: Gated<Saturation>; // 5, gate 0.7
  supplierMatches: SupplierMatches; // 6
  evidence: EvidenceList; // 7
  exports: Exports; // 8
}
