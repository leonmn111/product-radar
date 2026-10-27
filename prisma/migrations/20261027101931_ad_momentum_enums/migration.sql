-- Ad Momentum (Phase 3), step 1 of 2: the new enum values on their own. Postgres can't use a value
-- added in the same transaction, so the CHECK that names AD_ACTIVE_ADS is in the next migration.

-- AlterEnum
ALTER TYPE "EvidenceMetric" ADD VALUE 'AD_ACTIVE_ADS';

-- AlterEnum
ALTER TYPE "SourceType" ADD VALUE 'AD_LIBRARY';
