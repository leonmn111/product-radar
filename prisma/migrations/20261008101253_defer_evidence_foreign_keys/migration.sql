-- Evidence is referenced by Offers and ProductScores, and all three cascade
-- from Product. Checked immediately, the "evidence still referenced" rule can
-- fire mid-cascade and block deleting a product. Deferring the check to
-- commit time lets the cascade finish first, while still blocking a direct
-- delete of evidence that an offer or score depends on (Evidence-First).
-- Prisma can't express DEFERRABLE, so it is set here by hand.

ALTER TABLE "Offer"
  ALTER CONSTRAINT "Offer_sourceEvidenceId_productId_fkey" DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "ProductScoreEvidence"
  ALTER CONSTRAINT "ProductScoreEvidence_evidenceId_fkey" DEFERRABLE INITIALLY DEFERRED;
