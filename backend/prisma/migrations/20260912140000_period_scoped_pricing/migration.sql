-- Coverage pricing (default and per-agent override, all three pricing
-- modes) now varies by coverage period, not just by coverage — a coverage
-- can charge a different rate/tier table for its 180-day period than its
-- 365-day one. Every pricing row across the 6 tables below is tied to a
-- specific CoverageAllowablePeriod instead of a coverage directly — that row
-- already carries the coverage_id, so pricing rows don't need their own copy
-- of it, they just join through the period.
--
-- All pricing configured before this migration predates the period concept
-- entirely, so per product decision it's treated as the 1-year (365-day)
-- price — existing rows are backfilled onto each coverage's 365-day period,
-- creating one if the coverage didn't already have it configured.

-- 1. Ensure a 365-day CoverageAllowablePeriod exists for every coverage that
--    currently has any pricing configured, in any of the 6 tables below.
INSERT INTO "CoverageAllowablePeriod" ("id", "coverage_id", "coverage_in_days")
SELECT gen_random_uuid(), needed.cov_id, 365
FROM (
  SELECT coverage_id AS cov_id FROM "CoveragePercentageBasedPricing"
  UNION
  SELECT coverage_id FROM "CoverageValuePercentageTier"
  UNION
  SELECT coverage_id FROM "CoverageTierBasedPricing"
  UNION
  SELECT product_coverage_id FROM "AgentNetrate"
  UNION
  SELECT coverage_id FROM "AgentValuePercentageTier"
  UNION
  SELECT coverage_id FROM "AgentFlatTierPricing"
) needed
WHERE NOT EXISTS (
  SELECT 1 FROM "CoverageAllowablePeriod" cap
  WHERE cap.coverage_id = needed.cov_id AND cap.coverage_in_days = 365
);

-- 2. Add the new (nullable for now) period column to each pricing table.
ALTER TABLE "CoveragePercentageBasedPricing" ADD COLUMN "coverage_allowable_period_id" UUID;
ALTER TABLE "CoverageValuePercentageTier" ADD COLUMN "coverage_allowable_period_id" UUID;
ALTER TABLE "CoverageTierBasedPricing" ADD COLUMN "coverage_allowable_period_id" UUID;
ALTER TABLE "AgentNetrate" ADD COLUMN "coverage_allowable_period_id" UUID;
ALTER TABLE "AgentValuePercentageTier" ADD COLUMN "coverage_allowable_period_id" UUID;
ALTER TABLE "AgentFlatTierPricing" ADD COLUMN "coverage_allowable_period_id" UUID;

-- 3. Backfill every existing row onto its coverage's 365-day period.
UPDATE "CoveragePercentageBasedPricing" p
SET "coverage_allowable_period_id" = cap.id
FROM "CoverageAllowablePeriod" cap
WHERE cap.coverage_id = p.coverage_id AND cap.coverage_in_days = 365;

UPDATE "CoverageValuePercentageTier" p
SET "coverage_allowable_period_id" = cap.id
FROM "CoverageAllowablePeriod" cap
WHERE cap.coverage_id = p.coverage_id AND cap.coverage_in_days = 365;

UPDATE "CoverageTierBasedPricing" p
SET "coverage_allowable_period_id" = cap.id
FROM "CoverageAllowablePeriod" cap
WHERE cap.coverage_id = p.coverage_id AND cap.coverage_in_days = 365;

UPDATE "AgentNetrate" p
SET "coverage_allowable_period_id" = cap.id
FROM "CoverageAllowablePeriod" cap
WHERE cap.coverage_id = p.product_coverage_id AND cap.coverage_in_days = 365;

UPDATE "AgentValuePercentageTier" p
SET "coverage_allowable_period_id" = cap.id
FROM "CoverageAllowablePeriod" cap
WHERE cap.coverage_id = p.coverage_id AND cap.coverage_in_days = 365;

UPDATE "AgentFlatTierPricing" p
SET "coverage_allowable_period_id" = cap.id
FROM "CoverageAllowablePeriod" cap
WHERE cap.coverage_id = p.coverage_id AND cap.coverage_in_days = 365;

-- 4. Now that every row has one, make it required.
ALTER TABLE "CoveragePercentageBasedPricing" ALTER COLUMN "coverage_allowable_period_id" SET NOT NULL;
ALTER TABLE "CoverageValuePercentageTier" ALTER COLUMN "coverage_allowable_period_id" SET NOT NULL;
ALTER TABLE "CoverageTierBasedPricing" ALTER COLUMN "coverage_allowable_period_id" SET NOT NULL;
ALTER TABLE "AgentNetrate" ALTER COLUMN "coverage_allowable_period_id" SET NOT NULL;
ALTER TABLE "AgentValuePercentageTier" ALTER COLUMN "coverage_allowable_period_id" SET NOT NULL;
ALTER TABLE "AgentFlatTierPricing" ALTER COLUMN "coverage_allowable_period_id" SET NOT NULL;

-- 5. Drop each table's old coverage-scoped uniqueness/FK (coverage_id /
--    product_coverage_id — redundant now that the period row already
--    identifies the coverage) and replace it with one scoped by period.

-- CoveragePercentageBasedPricing: was one row per coverage, now one per period (1:1).
DROP INDEX "CoveragePercentageBasedPricing_coverage_id_key";
ALTER TABLE "CoveragePercentageBasedPricing" DROP CONSTRAINT "CoveragePercentageBasedPricing_coverage_id_fkey";
ALTER TABLE "CoveragePercentageBasedPricing" DROP COLUMN "coverage_id";
CREATE UNIQUE INDEX "CoveragePercentageBasedPricing_period_key" ON "CoveragePercentageBasedPricing"("coverage_allowable_period_id");
ALTER TABLE "CoveragePercentageBasedPricing" ADD CONSTRAINT "CoveragePercentageBasedPricing_period_fkey" FOREIGN KEY ("coverage_allowable_period_id") REFERENCES "CoverageAllowablePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CoverageValuePercentageTier
DROP INDEX "CoverageValuePercentageTier_coverage_id_min_value_key";
DROP INDEX "CoverageValuePercentageTier_coverage_id_idx";
ALTER TABLE "CoverageValuePercentageTier" DROP CONSTRAINT "CoverageValuePercentageTier_coverage_id_fkey";
ALTER TABLE "CoverageValuePercentageTier" DROP COLUMN "coverage_id";
CREATE UNIQUE INDEX "CoverageValuePercentageTier_period_min_value_key" ON "CoverageValuePercentageTier"("coverage_allowable_period_id", "min_value");
ALTER TABLE "CoverageValuePercentageTier" ADD CONSTRAINT "CoverageValuePercentageTier_period_fkey" FOREIGN KEY ("coverage_allowable_period_id") REFERENCES "CoverageAllowablePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CoverageTierBasedPricing
DROP INDEX "CoverageTierBasedPricing_coverage_id_coverage_amount_key";
DROP INDEX "CoverageTierBasedPricing_coverage_id_idx";
ALTER TABLE "CoverageTierBasedPricing" DROP CONSTRAINT "CoverageTierBasedPricing_coverage_id_fkey";
ALTER TABLE "CoverageTierBasedPricing" DROP COLUMN "coverage_id";
CREATE UNIQUE INDEX "CoverageTierBasedPricing_period_amount_key" ON "CoverageTierBasedPricing"("coverage_allowable_period_id", "coverage_amount");
ALTER TABLE "CoverageTierBasedPricing" ADD CONSTRAINT "CoverageTierBasedPricing_period_fkey" FOREIGN KEY ("coverage_allowable_period_id") REFERENCES "CoverageAllowablePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AgentNetrate
ALTER TABLE "AgentNetrate" DROP CONSTRAINT "AgentNetrate_agent_id_product_coverage_id_key";
ALTER TABLE "AgentNetrate" DROP CONSTRAINT "AgentNetrate_product_coverage_id_fkey";
ALTER TABLE "AgentNetrate" DROP COLUMN "product_coverage_id";
CREATE UNIQUE INDEX "AgentNetrate_agent_period_key" ON "AgentNetrate"("agent_id", "coverage_allowable_period_id");
ALTER TABLE "AgentNetrate" ADD CONSTRAINT "AgentNetrate_period_fkey" FOREIGN KEY ("coverage_allowable_period_id") REFERENCES "CoverageAllowablePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AgentValuePercentageTier
DROP INDEX "AgentValuePercentageTier_agent_id_coverage_id_min_value_key";
DROP INDEX "AgentValuePercentageTier_coverage_id_idx";
ALTER TABLE "AgentValuePercentageTier" DROP CONSTRAINT "AgentValuePercentageTier_coverage_id_fkey";
ALTER TABLE "AgentValuePercentageTier" DROP COLUMN "coverage_id";
CREATE UNIQUE INDEX "AgentValuePercentageTier_agent_period_min_value_key" ON "AgentValuePercentageTier"("agent_id", "coverage_allowable_period_id", "min_value");
ALTER TABLE "AgentValuePercentageTier" ADD CONSTRAINT "AgentValuePercentageTier_period_fkey" FOREIGN KEY ("coverage_allowable_period_id") REFERENCES "CoverageAllowablePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AgentFlatTierPricing
DROP INDEX "AgentFlatTierPricing_agent_id_coverage_id_coverage_amount_key";
DROP INDEX "AgentFlatTierPricing_coverage_id_idx";
ALTER TABLE "AgentFlatTierPricing" DROP CONSTRAINT "AgentFlatTierPricing_coverage_id_fkey";
ALTER TABLE "AgentFlatTierPricing" DROP COLUMN "coverage_id";
CREATE UNIQUE INDEX "AgentFlatTierPricing_agent_period_amount_key" ON "AgentFlatTierPricing"("agent_id", "coverage_allowable_period_id", "coverage_amount");
ALTER TABLE "AgentFlatTierPricing" ADD CONSTRAINT "AgentFlatTierPricing_period_fkey" FOREIGN KEY ("coverage_allowable_period_id") REFERENCES "CoverageAllowablePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Every pricing row now points at exactly one period, so the plain
--    per-table period index is covered by the composite/unique indexes
--    above (period is always the leftmost or sole key) — no separate index
--    needed.
