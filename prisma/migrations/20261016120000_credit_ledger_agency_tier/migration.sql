-- CreateEnum
CREATE TYPE "CreditEntryKind" AS ENUM ('PURCHASE', 'SPEND', 'REFUND');

-- AlterEnum: the unused BUSINESS tier becomes AGENCY. A rename keeps any existing row valid
-- (Prisma's default would recreate the type and fail on rows that hold the old value).
ALTER TYPE "SubscriptionTier" RENAME VALUE 'BUSINESS' TO 'AGENCY';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformCredits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "CreditEntryKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "stripeSessionId" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedgerEntry_stripeSessionId_key" ON "CreditLedgerEntry"("stripeSessionId");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_userId_createdAt_idx" ON "CreditLedgerEntry"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written CHECK constraints (Prisma can't express these) ────────────
-- A balance can never go below zero, and every ledger entry is a real, consistent movement.

ALTER TABLE "User" ADD CONSTRAINT "User_platformCredits_non_negative_chk"
  CHECK ("platformCredits" >= 0);
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_balanceAfter_non_negative_chk"
  CHECK ("balanceAfter" >= 0);
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_delta_sign_chk"
  CHECK (CASE "kind" WHEN 'SPEND' THEN "delta" < 0 ELSE "delta" > 0 END);
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_purchase_has_session_chk"
  CHECK (("kind" = 'PURCHASE') = ("stripeSessionId" IS NOT NULL));
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_spend_has_reference_chk"
  CHECK ("kind" = 'PURCHASE' OR "reference" IS NOT NULL);
