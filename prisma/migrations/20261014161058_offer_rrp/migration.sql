-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "rrp" DECIMAL(12,2),
ADD COLUMN     "rrpEvidenceId" UUID;

-- CreateIndex
CREATE INDEX "Offer_rrpEvidenceId_productId_idx" ON "Offer"("rrpEvidenceId", "productId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_rrpEvidenceId_productId_fkey" FOREIGN KEY ("rrpEvidenceId", "productId") REFERENCES "Evidence"("id", "productId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ─── Hand-written (Prisma can't express these) ──────────────────────────────

-- Like the price's own evidence link: checked at commit, so deleting a product
-- (which cascades to both offers and evidence) never trips over the order.
ALTER TABLE "Offer"
  ALTER CONSTRAINT "Offer_rrpEvidenceId_productId_fkey" DEFERRABLE INITIALLY DEFERRED;

-- Evidence-First: an RRP is only stored together with the evidence that records it.
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_rrp_evidence_pair_chk"
  CHECK (("rrp" IS NULL) = ("rrpEvidenceId" IS NULL));

ALTER TABLE "Offer" ADD CONSTRAINT "Offer_rrp_positive_chk"
  CHECK ("rrp" IS NULL OR "rrp" > 0);
