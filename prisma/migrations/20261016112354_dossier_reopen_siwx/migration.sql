-- AlterTable
ALTER TABLE "AgentPayment" ADD COLUMN     "reference" TEXT,
ADD COLUMN     "resourcePath" TEXT;

-- CreateTable
CREATE TABLE "SiwxNonce" (
    "nonce" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiwxNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "DossierRecord" (
    "id" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "sample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DossierRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiwxNonce_usedAt_idx" ON "SiwxNonce"("usedAt");

-- CreateIndex
CREATE INDEX "DossierRecord_productKey_createdAt_idx" ON "DossierRecord"("productKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AgentPayment_payer_resourcePath_status_idx" ON "AgentPayment"("payer", "resourcePath", "status");
