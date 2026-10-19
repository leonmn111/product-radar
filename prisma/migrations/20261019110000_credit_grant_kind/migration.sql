-- AlterEnum: a plan's monthly credits (Agency), granted on a paid subscription invoice.
ALTER TYPE "CreditEntryKind" ADD VALUE 'GRANT';

-- AlterTable
ALTER TABLE "CreditLedgerEntry" ADD COLUMN     "stripeInvoiceId" TEXT;

-- CreateIndex: one grant per invoice, however often Stripe delivers the event.
CREATE UNIQUE INDEX "CreditLedgerEntry_stripeInvoiceId_key" ON "CreditLedgerEntry"("stripeInvoiceId");
