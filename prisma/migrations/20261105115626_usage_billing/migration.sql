/*
  Warnings:

  - You are about to drop the column `usdcBalance` on the `Wallet` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "Wallet" DROP COLUMN "usdcBalance";

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "apiKeyId" UUID,
    "endpoint" TEXT NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "settlementId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "txSignature" TEXT,
    "lastValidBlockHeight" BIGINT,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_walletId_settlementId_idx" ON "UsageEvent"("walletId", "settlementId");

-- CreateIndex
CREATE INDEX "UsageEvent_settlementId_idx" ON "UsageEvent"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_txSignature_key" ON "Settlement"("txSignature");

-- CreateIndex
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");

-- CreateIndex
CREATE INDEX "Settlement_walletId_createdAt_idx" ON "Settlement"("walletId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "AgentApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks Prisma can't express (written by hand).
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_amountMicros_check" CHECK ("amountMicros" > 0);
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_amountMicros_check" CHECK ("amountMicros" >= 0);
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_reason_check" CHECK ("reason" IN ('daily', 'threshold'));
-- At most one transfer in flight per wallet, so the same usage can never be pulled twice.
CREATE UNIQUE INDEX "Settlement_one_in_flight_per_wallet" ON "Settlement"("walletId") WHERE "status" IN ('PENDING', 'SUBMITTED');
