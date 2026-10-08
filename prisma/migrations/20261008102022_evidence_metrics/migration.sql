-- CreateEnum
CREATE TYPE "EvidenceMetric" AS ENUM ('RATING', 'REVIEW_COUNT', 'SENTIMENT', 'SEARCH_INTEREST');

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metric" "EvidenceMetric",
ADD COLUMN     "metricValue" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Evidence_productId_metric_observedAt_idx" ON "Evidence"("productId", "metric", "observedAt" DESC);

-- ─── Hand-written CHECK constraints (Prisma can't express these) ────────────

-- A metric and its value come as a pair: both set, or both empty.
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_metric_pair_chk"
  CHECK (("metric" IS NULL) = ("metricValue" IS NULL));

-- Each metric has a fixed, documented range so the scoring formulas can rely on it.
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_metricValue_range_chk"
  CHECK (
    "metric" IS NULL
    OR ("metric" = 'RATING'          AND "metricValue" BETWEEN 0 AND 5)
    OR ("metric" = 'REVIEW_COUNT'    AND "metricValue" >= 0 AND "metricValue" = trunc("metricValue"))
    OR ("metric" = 'SENTIMENT'       AND "metricValue" BETWEEN -1 AND 1)
    OR ("metric" = 'SEARCH_INTEREST' AND "metricValue" BETWEEN 0 AND 100)
  );
