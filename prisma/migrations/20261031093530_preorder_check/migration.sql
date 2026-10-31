-- CreateEnum
CREATE TYPE "PreorderCheckStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "PreorderCheck" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "claims" JSONB NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'gbp',
    "status" "PreorderCheckStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "breakdown" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreorderCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreorderCheck_stripeSessionId_key" ON "PreorderCheck"("stripeSessionId");

-- CreateIndex
CREATE INDEX "PreorderCheck_email_asin_idx" ON "PreorderCheck"("email", "asin");
