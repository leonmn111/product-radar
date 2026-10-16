-- CreateTable
CREATE TABLE "DossierCache" (
    "id" UUID NOT NULL,
    "marketplace" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "dossier" JSON NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + '48:00:00'::interval),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DossierCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendSnapshot" (
    "id" UUID NOT NULL,
    "marketplace" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "rank" INTEGER,
    "rankCategory" TEXT,
    "pricePence" INTEGER,
    "currency" TEXT,
    "salesVelocity" INTEGER,
    "velocityMethod" TEXT,
    "provider" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "quality" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DossierCache_expiresAt_idx" ON "DossierCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DossierCache_marketplace_productId_key" ON "DossierCache"("marketplace", "productId");

-- CreateIndex
CREATE INDEX "TrendSnapshot_marketplace_productId_snapshotDate_idx" ON "TrendSnapshot"("marketplace", "productId", "snapshotDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TrendSnapshot_marketplace_productId_snapshotDate_provider_key" ON "TrendSnapshot"("marketplace", "productId", "snapshotDate", "provider");

-- ─── Hand-written CHECK constraints (Prisma can't express these) ────────────
-- The database-level backstop for CLAUDE.md Rule 3: every snapshot value has a valid source,
-- time and quality, and no value is negative or half-stated.

-- DossierCache: an entry expires after its evidence was read, and at most 48 hours after it was saved.
ALTER TABLE "DossierCache" ADD CONSTRAINT "DossierCache_expiry_window_chk"
  CHECK ("expiresAt" > "generatedAt" AND "expiresAt" <= "createdAt" + interval '48 hours');
ALTER TABLE "DossierCache" ADD CONSTRAINT "DossierCache_productId_not_blank_chk"
  CHECK (length(btrim("productId")) > 0);

-- TrendSnapshot
ALTER TABLE "TrendSnapshot" ADD CONSTRAINT "TrendSnapshot_quality_range_chk"
  CHECK ("quality" >= 0 AND "quality" <= 100);
ALTER TABLE "TrendSnapshot" ADD CONSTRAINT "TrendSnapshot_sourceUrl_http_chk"
  CHECK ("sourceUrl" ~* '^https?://[^\s]+$');
ALTER TABLE "TrendSnapshot" ADD CONSTRAINT "TrendSnapshot_rank_positive_chk"
  CHECK ("rank" IS NULL OR "rank" > 0);
ALTER TABLE "TrendSnapshot" ADD CONSTRAINT "TrendSnapshot_price_with_currency_chk"
  CHECK (("pricePence" IS NULL) = ("currency" IS NULL) AND ("pricePence" IS NULL OR "pricePence" >= 0)
         AND ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'));
ALTER TABLE "TrendSnapshot" ADD CONSTRAINT "TrendSnapshot_velocity_with_method_chk"
  CHECK (("salesVelocity" IS NULL) = ("velocityMethod" IS NULL) AND ("salesVelocity" IS NULL OR "salesVelocity" >= 0));
ALTER TABLE "TrendSnapshot" ADD CONSTRAINT "TrendSnapshot_productId_not_blank_chk"
  CHECK (length(btrim("productId")) > 0);
