-- AlterTable
ALTER TABLE "DossierRecord" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "generatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "title" TEXT,
ADD COLUMN     "verdict" TEXT;

-- Backfill the summary from the stored Dossiers (body is json, so ->> reads it directly).
UPDATE "DossierRecord" SET
  "title" = "body"->'product'->>'title',
  "verdict" = CASE WHEN "body"->'verdict'->>'status' = 'shown' THEN "body"->'verdict'->'value'->>'kind' ELSE 'WITHHELD' END,
  "confidence" = ("body"->'verdict'->>'confidence')::double precision,
  "generatedAt" = ("body"->>'generatedAt')::timestamptz;
