-- Ad Momentum (Phase 3), step 2 of 2: the watch, snapshot and observation tables (owner-approved
-- 2026-10-27), their checks, and the AD_ACTIVE_ADS range on Evidence.

-- CreateEnum
CREATE TYPE "AdSearchKind" AS ENUM ('KEYWORD', 'BRAND');

-- CreateTable
CREATE TABLE "AdWatch" (
    "id" UUID NOT NULL,
    "productKey" TEXT NOT NULL,
    "searchTerms" TEXT NOT NULL,
    "kind" "AdSearchKind" NOT NULL DEFAULT 'KEYWORD',
    "countries" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdMomentumSnapshot" (
    "id" UUID NOT NULL,
    "watchId" UUID NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "activeAds" INTEGER NOT NULL,
    "scalingAds" INTEGER NOT NULL,
    "advertisers" INTEGER NOT NULL,
    "newAds7d" INTEGER NOT NULL,
    "longestRunningDays" INTEGER,
    "medianAgeDays" INTEGER,
    "euReach" BIGINT,
    "truncated" BOOLEAN NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "methodologyVersion" TEXT NOT NULL,

    CONSTRAINT "AdMomentumSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdObservation" (
    "snapshotId" UUID NOT NULL,
    "libraryId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "platforms" TEXT[],
    "euReach" INTEGER,
    "scaling" BOOLEAN NOT NULL,

    CONSTRAINT "AdObservation_pkey" PRIMARY KEY ("snapshotId","libraryId")
);

-- CreateIndex
CREATE INDEX "AdWatch_active_lastCheckedAt_idx" ON "AdWatch"("active", "lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdWatch_productKey_searchTerms_kind_key" ON "AdWatch"("productKey", "searchTerms", "kind");

-- CreateIndex
CREATE INDEX "AdMomentumSnapshot_watchId_snapshotDate_idx" ON "AdMomentumSnapshot"("watchId", "snapshotDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AdMomentumSnapshot_watchId_snapshotDate_key" ON "AdMomentumSnapshot"("watchId", "snapshotDate");

-- CreateIndex
CREATE INDEX "AdObservation_libraryId_idx" ON "AdObservation"("libraryId");

-- AddForeignKey
ALTER TABLE "AdMomentumSnapshot" ADD CONSTRAINT "AdMomentumSnapshot_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "AdWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdObservation" ADD CONSTRAINT "AdObservation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "AdMomentumSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written CHECK constraints (Prisma can't express these) ────────────

-- What Meta accepts: 1–100 characters of search terms, at least one country.
ALTER TABLE "AdWatch" ADD CONSTRAINT "AdWatch_searchTerms_chk"
  CHECK (char_length(btrim("searchTerms")) BETWEEN 1 AND 100);
ALTER TABLE "AdWatch" ADD CONSTRAINT "AdWatch_countries_chk"
  CHECK (cardinality("countries") >= 1);

-- Counts are whole and never negative; scaling and new ads are a subset of the active ads.
ALTER TABLE "AdMomentumSnapshot" ADD CONSTRAINT "AdMomentumSnapshot_counts_chk"
  CHECK (
    "activeAds" >= 0 AND "advertisers" >= 0
    AND "scalingAds" BETWEEN 0 AND "activeAds"
    AND "newAds7d" BETWEEN 0 AND "activeAds"
    AND "advertisers" <= "activeAds"
    AND ("longestRunningDays" IS NULL OR "longestRunningDays" >= 0)
    AND ("medianAgeDays" IS NULL OR "medianAgeDays" >= 0)
    AND ("euReach" IS NULL OR "euReach" >= 0)
  );
ALTER TABLE "AdMomentumSnapshot" ADD CONSTRAINT "AdMomentumSnapshot_confidence_chk"
  CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "AdObservation" ADD CONSTRAINT "AdObservation_euReach_chk"
  CHECK ("euReach" IS NULL OR "euReach" >= 0);

-- Evidence: AD_ACTIVE_ADS is a whole number of ads (the enum value was added in the previous migration).
ALTER TABLE "Evidence" DROP CONSTRAINT "Evidence_metricValue_range_chk";
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_metricValue_range_chk"
  CHECK (
    "metric" IS NULL
    OR ("metric" = 'RATING'          AND "metricValue" BETWEEN 0 AND 5)
    OR ("metric" = 'REVIEW_COUNT'    AND "metricValue" >= 0 AND "metricValue" = trunc("metricValue"))
    OR ("metric" = 'SENTIMENT'       AND "metricValue" BETWEEN -1 AND 1)
    OR ("metric" = 'SEARCH_INTEREST' AND "metricValue" BETWEEN 0 AND 100)
    OR ("metric" = 'AD_ACTIVE_ADS'   AND "metricValue" >= 0 AND "metricValue" = trunc("metricValue"))
  );
