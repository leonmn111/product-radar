// What the landing page's free check (POST /api/free-verdict) returns: the verdict and how sure it is, never
// the margin figures behind it (those are the paid Dossier).
export type FreeVerdict = {
  asin: string;
  title: string;
  verdict: { status: "shown"; kind: "LAUNCH" | "TEST" | "AVOID"; gate: "G1_PROFIT" | "G3_BRAND" | null; confidence: number } | { status: "withheld"; reason: string; confidence: number; missing: string[] };
  evidenceCount: number;
  supplierMatches: number;
  /** A failed resale check: "ip" shows as High IP Risk, "compliance" as Compliance Gated. */
  risk: "ip" | "compliance" | null;
  fromCache: boolean;
  fullDossier: string; // where to sign up and open the full Dossier
};
