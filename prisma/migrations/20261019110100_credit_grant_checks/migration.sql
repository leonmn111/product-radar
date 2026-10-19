-- ─── Hand-written CHECK constraint (Prisma can't express it) ────────────────
-- In its own migration: Postgres can't use an enum value in the same transaction that adds it.
-- A GRANT always names the invoice it was granted for, and only a GRANT does.
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_grant_has_invoice_chk"
  CHECK (("kind" = 'GRANT') = ("stripeInvoiceId" IS NOT NULL));
