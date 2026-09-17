-- Authorized Repair Limit is now always "Deductible + a fixed ₱500 towing
-- amount" (see pdf/theme.js's TOWING_AMOUNT/computeDeductibleFigures) rather
-- than deductible * a separately configured rate — drop that rate from both
-- the live catalog row and the frozen issued-Policy snapshot.
ALTER TABLE "ProductVariant" DROP COLUMN "authorized_repair_limit_rate";
ALTER TABLE "Policy" DROP COLUMN "authorized_repair_limit_rate_snapshot";

-- AlterEnum
ALTER TYPE "CoveragePricingMode" ADD VALUE 'VEHICLE_SEATS_BASED';

-- CreateTable
CREATE TABLE "CoverageSeatsBasedPricing" (
    "id" UUID NOT NULL,
    "coverage_allowable_period_id" UUID NOT NULL,
    "threshold_seats" INTEGER NOT NULL,
    "rate_per_excess_seat" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverageSeatsBasedPricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoverageSeatsBasedPricing_coverage_allowable_period_id_key" ON "CoverageSeatsBasedPricing"("coverage_allowable_period_id");

ALTER TABLE "CoverageSeatsBasedPricing" ADD CONSTRAINT "CoverageSeatsBasedPricing_coverage_allowable_period_id_fkey" FOREIGN KEY ("coverage_allowable_period_id") REFERENCES "CoverageAllowablePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AgentSeatsBasedPricing" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "coverage_allowable_period_id" UUID NOT NULL,
    "threshold_seats" INTEGER NOT NULL,
    "rate_per_excess_seat" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSeatsBasedPricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentSeatsBasedPricing_agent_id_coverage_allowable_period__key" ON "AgentSeatsBasedPricing"("agent_id", "coverage_allowable_period_id");
CREATE INDEX "AgentSeatsBasedPricing_agent_id_idx" ON "AgentSeatsBasedPricing"("agent_id");

ALTER TABLE "AgentSeatsBasedPricing"
  ADD CONSTRAINT "AgentSeatsBasedPricing_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AgentSeatsBasedPricing_coverage_allowable_period_id_fkey" FOREIGN KEY ("coverage_allowable_period_id") REFERENCES "CoverageAllowablePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
