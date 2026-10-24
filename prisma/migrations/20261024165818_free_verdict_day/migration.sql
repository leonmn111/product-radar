-- CreateTable
CREATE TABLE "FreeVerdictDay" (
    "day" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FreeVerdictDay_pkey" PRIMARY KEY ("day")
);

-- ─── Hand-written CHECK constraint (Prisma can't express it) ────────────────
ALTER TABLE "FreeVerdictDay" ADD CONSTRAINT "FreeVerdictDay_used_nonnegative_chk" CHECK ("used" >= 0);
