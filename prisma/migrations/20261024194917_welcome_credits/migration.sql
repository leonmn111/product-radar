-- AlterEnum
ALTER TYPE "CreditEntryKind" ADD VALUE 'WELCOME';

-- CreateTable
CREATE TABLE "WelcomeGrant" (
    "userId" UUID NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WelcomeGrant_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WelcomeGrantDay" (
    "day" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WelcomeGrantDay_pkey" PRIMARY KEY ("day")
);

-- AddForeignKey
ALTER TABLE "WelcomeGrant" ADD CONSTRAINT "WelcomeGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written CHECK constraints (Prisma can't express them) ─────────────
ALTER TABLE "WelcomeGrant" ADD CONSTRAINT "WelcomeGrant_credits_positive_chk" CHECK ("credits" > 0);
ALTER TABLE "WelcomeGrantDay" ADD CONSTRAINT "WelcomeGrantDay_used_nonnegative_chk" CHECK ("used" >= 0);
