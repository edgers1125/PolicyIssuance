-- CreateEnum
CREATE TYPE "CoveragePricingMode" AS ENUM ('PERCENTAGE', 'VALUE_PERCENTAGE', 'FLAT_TIER');

-- AlterTable: every existing coverage keeps working exactly as before.
ALTER TABLE "ProductCoverage" ADD COLUMN "pricing_mode" "CoveragePricingMode" NOT NULL DEFAULT 'PERCENTAGE';

-- CreateTable
CREATE TABLE "CoverageValuePercentageTier" (
    "id" UUID NOT NULL,
    "coverage_id" UUID NOT NULL,
    "min_value" DECIMAL(18,2) NOT NULL,
    "rate_percentage" DECIMAL(7,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageValuePercentageTier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoverageValuePercentageTier_coverage_id_min_value_key" ON "CoverageValuePercentageTier"("coverage_id", "min_value");
CREATE INDEX "CoverageValuePercentageTier_coverage_id_idx" ON "CoverageValuePercentageTier"("coverage_id");

ALTER TABLE "CoverageValuePercentageTier" ADD CONSTRAINT "CoverageValuePercentageTier_coverage_id_fkey"
  FOREIGN KEY ("coverage_id") REFERENCES "ProductCoverage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CoverageTierBasedPricing" (
    "id" UUID NOT NULL,
    "coverage_id" UUID NOT NULL,
    "coverage_amount" DECIMAL(18,2) NOT NULL,
    "coverage_price" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageTierBasedPricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoverageTierBasedPricing_coverage_id_coverage_amount_key" ON "CoverageTierBasedPricing"("coverage_id", "coverage_amount");
CREATE INDEX "CoverageTierBasedPricing_coverage_id_idx" ON "CoverageTierBasedPricing"("coverage_id");

ALTER TABLE "CoverageTierBasedPricing" ADD CONSTRAINT "CoverageTierBasedPricing_coverage_id_fkey"
  FOREIGN KEY ("coverage_id") REFERENCES "ProductCoverage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
