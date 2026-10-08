-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'DISCONTINUED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('MANUFACTURER', 'RETAILER', 'REVIEW', 'FORUM', 'NEWS', 'SOCIAL', 'MARKETPLACE', 'OTHER');

-- CreateEnum
CREATE TYPE "ScoreDimension" AS ENUM ('OVERALL', 'VALUE', 'QUALITY', 'DEMAND', 'TREND', 'SENTIMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sourceEvidenceId" UUID NOT NULL,
    "merchant" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "availability" "Availability" NOT NULL DEFAULT 'UNKNOWN',
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "claim" TEXT NOT NULL,
    "excerpt" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "qualityScore" DECIMAL(5,2) NOT NULL,
    "contentHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductScore" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "dimension" "ScoreDimension" NOT NULL,
    "value" DECIMAL(5,2) NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductScoreEvidence" (
    "scoreId" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,

    CONSTRAINT "ProductScoreEvidence_pkey" PRIMARY KEY ("scoreId","evidenceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_subscriptionTier_idx" ON "User"("subscriptionTier");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_category_createdAt_idx" ON "Product"("category", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Offer_productId_observedAt_idx" ON "Offer"("productId", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "Offer_productId_price_idx" ON "Offer"("productId", "price");

-- CreateIndex
CREATE INDEX "Offer_sourceEvidenceId_productId_idx" ON "Offer"("sourceEvidenceId", "productId");

-- CreateIndex
CREATE INDEX "Evidence_productId_observedAt_idx" ON "Evidence"("productId", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "Evidence_productId_qualityScore_idx" ON "Evidence"("productId", "qualityScore" DESC);

-- CreateIndex
CREATE INDEX "Evidence_sourceType_idx" ON "Evidence"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_id_productId_key" ON "Evidence"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_productId_contentHash_key" ON "Evidence"("productId", "contentHash");

-- CreateIndex
CREATE INDEX "ProductScore_dimension_value_idx" ON "ProductScore"("dimension", "value" DESC);

-- CreateIndex
CREATE INDEX "ProductScore_productId_dimension_calculatedAt_idx" ON "ProductScore"("productId", "dimension", "calculatedAt" DESC);

-- CreateIndex
CREATE INDEX "ProductScoreEvidence_evidenceId_idx" ON "ProductScoreEvidence"("evidenceId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_sourceEvidenceId_productId_fkey" FOREIGN KEY ("sourceEvidenceId", "productId") REFERENCES "Evidence"("id", "productId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductScore" ADD CONSTRAINT "ProductScore_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductScoreEvidence" ADD CONSTRAINT "ProductScoreEvidence_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "ProductScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductScoreEvidence" ADD CONSTRAINT "ProductScoreEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ─── Hand-written CHECK constraints ─────────────────────────────────────────
-- Prisma's schema language can't express these, so they live here. They are
-- the database-level backstop for CLAUDE.md Rule 3 (Evidence-First) and
-- Rule 4 (scores are bounded estimates). Prisma's migration diff ignores
-- CHECK constraints, so future migrations will not drop them.

-- User
ALTER TABLE "User" ADD CONSTRAINT "User_email_format_chk"
  CHECK ("email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Product: category is a lowercase slug (e.g. "kitchen-appliances") so the
-- category index always matches — no "Kitchen" vs "kitchen" splits.
ALTER TABLE "Product" ADD CONSTRAINT "Product_slug_format_chk"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Product" ADD CONSTRAINT "Product_category_format_chk"
  CHECK ("category" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Product" ADD CONSTRAINT "Product_name_not_blank_chk"
  CHECK (length(btrim("name")) > 0);

-- Offer
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_price_non_negative_chk"
  CHECK ("price" >= 0);
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_currency_iso4217_chk"
  CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_url_http_chk"
  CHECK ("url" ~* '^https?://[^\s]+$');
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_merchant_not_blank_chk"
  CHECK (length(btrim("merchant")) > 0);

-- Evidence: source, timestamp, and quality score are mandatory and valid.
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_qualityScore_range_chk"
  CHECK ("qualityScore" >= 0 AND "qualityScore" <= 100);
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sourceUrl_http_chk"
  CHECK ("sourceUrl" ~* '^https?://[^\s]+$');
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sourceName_not_blank_chk"
  CHECK (length(btrim("sourceName")) > 0);
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_claim_not_blank_chk"
  CHECK (length(btrim("claim")) > 0);
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_published_before_observed_chk"
  CHECK ("publishedAt" IS NULL OR "publishedAt" <= "observedAt");

-- ProductScore: bounded estimate with explicit confidence.
ALTER TABLE "ProductScore" ADD CONSTRAINT "ProductScore_value_range_chk"
  CHECK ("value" >= 0 AND "value" <= 100);
ALTER TABLE "ProductScore" ADD CONSTRAINT "ProductScore_confidence_range_chk"
  CHECK ("confidence" >= 0 AND "confidence" <= 1);
ALTER TABLE "ProductScore" ADD CONSTRAINT "ProductScore_methodologyVersion_not_blank_chk"
  CHECK (length(btrim("methodologyVersion")) > 0);
