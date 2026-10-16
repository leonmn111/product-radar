-- CreateEnum
CREATE TYPE "BulkJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE');

-- CreateEnum
CREATE TYPE "BulkItemStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "BulkJob" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "BulkJobStatus" NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BulkJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkJobItem" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "asin" TEXT NOT NULL,
    "status" "BulkItemStatus" NOT NULL DEFAULT 'PENDING',
    "dossierId" TEXT NOT NULL,
    "error" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BulkJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkJob_userId_createdAt_idx" ON "BulkJob"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "BulkJobItem_dossierId_key" ON "BulkJobItem"("dossierId");

-- CreateIndex
CREATE INDEX "BulkJobItem_jobId_status_idx" ON "BulkJobItem"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BulkJobItem_jobId_asin_key" ON "BulkJobItem"("jobId", "asin");

-- AddForeignKey
ALTER TABLE "BulkJob" ADD CONSTRAINT "BulkJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkJobItem" ADD CONSTRAINT "BulkJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BulkJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written CHECK constraints (Prisma can't express these) ────────────
ALTER TABLE "BulkJob" ADD CONSTRAINT "BulkJob_total_range_chk" CHECK ("total" BETWEEN 1 AND 100);
ALTER TABLE "BulkJobItem" ADD CONSTRAINT "BulkJobItem_asin_format_chk" CHECK ("asin" ~ '^[A-Z0-9]{10}$');
ALTER TABLE "BulkJobItem" ADD CONSTRAINT "BulkJobItem_position_positive_chk" CHECK ("position" >= 1);
ALTER TABLE "BulkJobItem" ADD CONSTRAINT "BulkJobItem_failed_has_error_chk" CHECK (("status" = 'FAILED') = ("error" IS NOT NULL));
