import { z } from "zod";
import { ScoreDimension, SourceType } from "@/generated/prisma/enums";

// App-level guards for CLAUDE.md Rule 3 (Evidence-First) and Rule 4 (scores
// are estimates). The database enforces the same limits with CHECK
// constraints; these schemas give callers a readable error first.

// Captures can't come from the future. A small allowance covers clock skew
// between the scraper and the database server.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: "must be an http(s) URL" });

const nonBlank = z.string().trim().min(1);

export const EvidenceInput = z
  .object({
    productId: z.uuid(),
    claim: nonBlank,
    excerpt: z.string().trim().min(1).optional(),
    sourceUrl: httpUrl,
    sourceName: nonBlank,
    sourceType: z.enum(SourceType),
    observedAt: z.coerce
      .date()
      .refine((d) => d.getTime() <= Date.now() + CLOCK_SKEW_MS, { message: "cannot be in the future" }),
    publishedAt: z.coerce.date().optional(),
    qualityScore: z.number().min(0).max(100),
    contentHash: z.string().min(1).optional(),
  })
  .refine((e) => !e.publishedAt || e.publishedAt <= e.observedAt, {
    message: "publishedAt must be on or before observedAt",
    path: ["publishedAt"],
  });

export type EvidenceInput = z.infer<typeof EvidenceInput>;

export const ProductScoreInput = z.object({
  productId: z.uuid(),
  dimension: z.enum(ScoreDimension),
  value: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  methodologyVersion: nonBlank,
  // A score with no evidence behind it is an invented number.
  evidenceIds: z.array(z.uuid()).min(1, { message: "a score must cite at least one piece of evidence" }),
});

export type ProductScoreInput = z.infer<typeof ProductScoreInput>;
