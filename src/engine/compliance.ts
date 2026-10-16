// Resellability: can a reseller legally and practically sell this? (ARCHITECTURE.md › Resellability)
// Each flag is true / false only when evidence settles it; otherwise null with the reason. A product
// is never assumed safe (CLAUDE.md Rules 3 and 7).
// SCAFFOLD: signature only; built test-first in Phase 0, with the brand flagger.

import type { Evidence, Resellability } from "@/types/dossier";
import { notImplemented } from "./errors";

export type ResellabilityInput = {
  title: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  market: "UK" | "EU";
  country: string; // ISO code of the target market
  evidence: Evidence[]; // listings, trademark records, regulation sources gathered for this product
};

export function checkResellability(product: ResellabilityInput): Resellability {
  void product;
  return notImplemented("checkResellability");
}
