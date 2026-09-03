-- Add standard_rate and clause to ProductCoverage.
-- Temporary defaults let existing rows satisfy NOT NULL; seed.js backfills real values.
ALTER TABLE "ProductCoverage" ADD COLUMN "standard_rate" DECIMAL(10,6) NOT NULL DEFAULT 0.02;
ALTER TABLE "ProductCoverage" ADD COLUMN "clause" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ProductCoverage" ALTER COLUMN "standard_rate" DROP DEFAULT;
ALTER TABLE "ProductCoverage" ALTER COLUMN "clause" DROP DEFAULT;
