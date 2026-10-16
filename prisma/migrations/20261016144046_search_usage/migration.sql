-- CreateTable
CREATE TABLE "SearchUsage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "free" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchUsage_userId_createdAt_idx" ON "SearchUsage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SearchUsage" ADD CONSTRAINT "SearchUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
