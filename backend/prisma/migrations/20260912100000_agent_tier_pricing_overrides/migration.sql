-- AgentNetrate only ever covered PERCENTAGE-mode overrides. Now that a
-- coverage can be VALUE_PERCENTAGE or FLAT_TIER, agents need their own
-- override tables for those modes too — same replace-all-per-coverage shape
-- as the coverage-level CoverageValuePercentageTier/CoverageTierBasedPricing
-- tables, just scoped to (agent_id, coverage_id) instead of just coverage_id.
CREATE TABLE "AgentValuePercentageTier" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "coverage_id" UUID NOT NULL,
    "min_value" DECIMAL(18,2) NOT NULL,
    "rate_percentage" DECIMAL(7,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentValuePercentageTier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentValuePercentageTier_agent_id_coverage_id_min_value_key" ON "AgentValuePercentageTier"("agent_id", "coverage_id", "min_value");
CREATE INDEX "AgentValuePercentageTier_agent_id_idx" ON "AgentValuePercentageTier"("agent_id");
CREATE INDEX "AgentValuePercentageTier_coverage_id_idx" ON "AgentValuePercentageTier"("coverage_id");

ALTER TABLE "AgentValuePercentageTier"
  ADD CONSTRAINT "AgentValuePercentageTier_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT "AgentValuePercentageTier_coverage_id_fkey" FOREIGN KEY ("coverage_id") REFERENCES "ProductCoverage"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE "AgentFlatTierPricing" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "coverage_id" UUID NOT NULL,
    "coverage_amount" DECIMAL(18,2) NOT NULL,
    "coverage_price" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFlatTierPricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentFlatTierPricing_agent_id_coverage_id_coverage_amount_key" ON "AgentFlatTierPricing"("agent_id", "coverage_id", "coverage_amount");
CREATE INDEX "AgentFlatTierPricing_agent_id_idx" ON "AgentFlatTierPricing"("agent_id");
CREATE INDEX "AgentFlatTierPricing_coverage_id_idx" ON "AgentFlatTierPricing"("coverage_id");

ALTER TABLE "AgentFlatTierPricing"
  ADD CONSTRAINT "AgentFlatTierPricing_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT "AgentFlatTierPricing_coverage_id_fkey" FOREIGN KEY ("coverage_id") REFERENCES "ProductCoverage"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
