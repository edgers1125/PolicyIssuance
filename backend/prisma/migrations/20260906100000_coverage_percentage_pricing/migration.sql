-- Pulls PERCENTAGE mode's standard rate out of ProductCoverage into its own
-- table, since a coverage that isn't PERCENTAGE-priced has no use for it.
CREATE TABLE "CoveragePercentageBasedPricing" (
    "id" UUID NOT NULL,
    "coverage_id" UUID NOT NULL,
    "standard_rate" DECIMAL(10,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoveragePercentageBasedPricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoveragePercentageBasedPricing_coverage_id_key" ON "CoveragePercentageBasedPricing"("coverage_id");

ALTER TABLE "CoveragePercentageBasedPricing"
  ADD CONSTRAINT "CoveragePercentageBasedPricing_coverage_id_fkey"
  FOREIGN KEY ("coverage_id") REFERENCES "ProductCoverage"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- Carry every existing coverage's standard_rate over before dropping the
-- column, regardless of its pricing_mode — a VALUE_PERCENTAGE/FLAT_TIER
-- coverage just ends up with an unused row, which is harmless.
INSERT INTO "CoveragePercentageBasedPricing" ("id", "coverage_id", "standard_rate", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "standard_rate", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ProductCoverage";

ALTER TABLE "ProductCoverage" DROP COLUMN "standard_rate";
