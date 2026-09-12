-- CreateTable: a coverage can be offered for more than one allowable period
-- (e.g. 180 days, 365 days) — an application's single coverage_start_at/
-- coverage_end_at pair must be exactly one of these day counts for every
-- coverage selected on it.
CREATE TABLE "CoverageAllowablePeriod" (
    "id" UUID NOT NULL,
    "coverage_id" UUID NOT NULL,
    "coverage_in_days" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageAllowablePeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoverageAllowablePeriod_coverage_id_coverage_in_days_key" ON "CoverageAllowablePeriod"("coverage_id", "coverage_in_days");

CREATE INDEX "CoverageAllowablePeriod_coverage_id_idx" ON "CoverageAllowablePeriod"("coverage_id");

ALTER TABLE "CoverageAllowablePeriod" ADD CONSTRAINT "CoverageAllowablePeriod_coverage_id_fkey" FOREIGN KEY ("coverage_id") REFERENCES "ProductCoverage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
