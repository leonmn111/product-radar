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
}

/** Part 7: every evidence item the Dossier uses, in one auditable list. */
export type EvidenceList = Evidence[];

// ── Gating ───────────────────────────────────────────────────────────────────

export type Gated<T> =
  | { status: "shown"; confidence: number; value: T; evidenceIds: string[] }
  | { status: "withheld"; confidence: number; missing: string[] };

// ── Part 1: Verdict ──────────────────────────────────────────────────────────

export type VerdictKind = "LAUNCH" | "TEST" | "AVOID";

export interface Verdict {
  kind: VerdictKind;
  reasons: string[]; // plain-words reasons, each backed by the parts it cites
}

// ── Part 2: Resellability ────────────────────────────────────────────────────

/** A compliance flag: true / false when the evidence settles it, null when it doesn't (never assumed safe). */
export type ComplianceFlag = { value: boolean | null; reason: string; evidenceIds: string[] };

export interface Resellability {
  brandDirect: ComplianceFlag; // sold by the brand itself
  trademarked: ComplianceFlag; // registered trademark in the target market
  requiresUKCA: ComplianceFlag; // needs UKCA marking for Great Britain
  cosmetics: ComplianceFlag; // cosmetics rules apply
  batteries: ComplianceFlag; // contains batteries
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
  moq: number; // minimum order quantity
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

  verdict: Gated<Verdict>; // 1, gate 0.5
  resellability: Resellability; // 2
  landedMargin: Gated<LandedMargin>; // 3, gate 0.7
  momentum: Gated<Momentum>; // 4, gate 0.7
  saturation: Gated<Saturation>; // 5, gate 0.7
  supplierMatches: SupplierMatches; // 6
  evidence: EvidenceList; // 7
  exports: Exports; // 8
}
