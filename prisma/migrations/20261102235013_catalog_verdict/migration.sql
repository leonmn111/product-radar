-- CreateTable
CREATE TABLE "CatalogVerdict" (
    "productId" UUID NOT NULL,
    "verdict" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "gate" TEXT,
    "reason" TEXT,
    "missing" TEXT[],
    "asin" TEXT NOT NULL,
    "sellingPrice" DECIMAL(12,2),
    "supplierPrice" DECIMAL(12,2) NOT NULL,
    "supplierEvidenceId" UUID NOT NULL,
    "keepPerSale" DECIMAL(12,2),
    "checkedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CatalogVerdict_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE INDEX "CatalogVerdict_supplierEvidenceId_productId_idx" ON "CatalogVerdict"("supplierEvidenceId", "productId");

-- CreateIndex
CREATE INDEX "CatalogVerdict_verdict_idx" ON "CatalogVerdict"("verdict");

-- AddForeignKey
ALTER TABLE "CatalogVerdict" ADD CONSTRAINT "CatalogVerdict_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVerdict" ADD CONSTRAINT "CatalogVerdict_supplierEvidenceId_productId_fkey" FOREIGN KEY ("supplierEvidenceId", "productId") REFERENCES "Evidence"("id", "productId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Checks Prisma can't express (written by hand).
ALTER TABLE "CatalogVerdict" ADD CONSTRAINT "CatalogVerdict_verdict_check" CHECK ("verdict" IN ('LAUNCH', 'TEST', 'AVOID', 'WITHHELD'));
ALTER TABLE "CatalogVerdict" ADD CONSTRAINT "CatalogVerdict_supplierPrice_check" CHECK ("supplierPrice" > 0);
