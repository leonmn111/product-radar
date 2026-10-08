-- CreateEnum
CREATE TYPE "AgentPaymentStatus" AS ENUM ('RESERVED', 'SETTLED');

-- CreateTable
CREATE TABLE "AgentPayment" (
    "id" UUID NOT NULL,
    "nonce" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "payTo" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "status" "AgentPaymentStatus" NOT NULL DEFAULT 'RESERVED',
    "transaction" TEXT,
    "validBefore" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMPTZ(3),

    CONSTRAINT "AgentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPayment_nonce_key" ON "AgentPayment"("nonce");

-- CreateIndex
CREATE INDEX "AgentPayment_payer_createdAt_idx" ON "AgentPayment"("payer", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AgentPayment_status_createdAt_idx" ON "AgentPayment"("status", "createdAt");


-- Format guards for on-chain identifiers and amounts.
ALTER TABLE "AgentPayment" ADD CONSTRAINT "AgentPayment_nonce_format_chk" CHECK ("nonce" ~ '^0x[0-9a-f]{64}$');
ALTER TABLE "AgentPayment" ADD CONSTRAINT "AgentPayment_payer_format_chk" CHECK ("payer" ~ '^0x[0-9a-fA-F]{40}$');
ALTER TABLE "AgentPayment" ADD CONSTRAINT "AgentPayment_payTo_format_chk" CHECK ("payTo" ~ '^0x[0-9a-fA-F]{40}$');
ALTER TABLE "AgentPayment" ADD CONSTRAINT "AgentPayment_amount_format_chk" CHECK ("amount" ~ '^[0-9]+$');
