-- CreateTable
CREATE TABLE "Wallet" (
    "id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT,
    "nonceIssuedAt" TIMESTAMPTZ(3),
    "usdcBalance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMPTZ(3),
    "lastSignInAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentApiKey" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AgentApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

-- CreateIndex
CREATE INDEX "Wallet_verifiedAt_idx" ON "Wallet"("verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentApiKey_keyHash_key" ON "AgentApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "AgentApiKey_walletId_idx" ON "AgentApiKey"("walletId");

-- AddForeignKey
ALTER TABLE "AgentApiKey" ADD CONSTRAINT "AgentApiKey_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks Prisma can't express (written by hand).
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_address_check" CHECK ("address" ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_usdcBalance_check" CHECK ("usdcBalance" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_nonce_pair_check" CHECK (("nonce" IS NULL) = ("nonceIssuedAt" IS NULL));
