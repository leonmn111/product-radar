-- CreateTable
CREATE TABLE "ProviderToken" (
    "provider" TEXT NOT NULL,
    "sealed" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMPTZ(3),
    "refreshExpiresAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProviderToken_pkey" PRIMARY KEY ("provider")
);
