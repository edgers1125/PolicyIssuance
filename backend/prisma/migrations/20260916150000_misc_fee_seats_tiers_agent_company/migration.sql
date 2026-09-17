-- Miscellaneous is now a per-variant flat fee (routes/policyApplications.js's/
-- policyQuotations.js's POST / read this off the chosen ProductVariant
-- instead of accepting it from the client).
ALTER TABLE "ProductVariant" ADD COLUMN "misc_fee" DECIMAL(18,2);

-- VEHICLE_SEATS_BASED's rate is now tiered by insured-amount-per-occupant
-- (CoverageSeatsTierPricing/AgentSeatsTierPricing below) rather than a single
-- scalar alongside threshold_seats — no data loss, both tables are unused
-- (this pricing mode has never been enabled on any real coverage yet).
ALTER TABLE "CoverageSeatsBasedPricing" DROP COLUMN "rate_per_excess_seat";
ALTER TABLE "AgentSeatsBasedPricing" DROP COLUMN "rate_per_excess_seat";

-- CreateTable
CREATE TABLE "CoverageSeatsTierPricing" (
    "id" UUID NOT NULL,
    "coverage_allowable_period_id" UUID NOT NULL,
    "insured_amount_per_occupant" DECIMAL(18,2) NOT NULL,
    "rate_per_excess_seat" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageSeatsTierPricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoverageSeatsTierPricing_period_amount_key" ON "CoverageSeatsTierPricing"("coverage_allowable_period_id", "insured_amount_per_occupant");

ALTER TABLE "CoverageSeatsTierPricing" ADD CONSTRAINT "CoverageSeatsTierPricing_coverage_allowable_period_id_fkey" FOREIGN KEY ("coverage_allowable_period_id") REFERENCES "CoverageAllowablePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AgentSeatsTierPricing" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "coverage_allowable_period_id" UUID NOT NULL,
    "insured_amount_per_occupant" DECIMAL(18,2) NOT NULL,
    "rate_per_excess_seat" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSeatsTierPricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentSeatsTierPricing_agent_period_amount_key" ON "AgentSeatsTierPricing"("agent_id", "coverage_allowable_period_id", "insured_amount_per_occupant");
CREATE INDEX "AgentSeatsTierPricing_agent_id_idx" ON "AgentSeatsTierPricing"("agent_id");

ALTER TABLE "AgentSeatsTierPricing"
  ADD CONSTRAINT "AgentSeatsTierPricing_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AgentSeatsTierPricing_coverage_allowable_period_id_fkey" FOREIGN KEY ("coverage_allowable_period_id") REFERENCES "CoverageAllowablePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A CORPORATE agent can optionally be backed by a real Company record (the
-- same Company table insured parties use) — create-or-select in the same
-- request (routes/agents.js's POST /), and see routes/companies.js's GET /
-- for how this makes the linked company selectable by every individual
-- employed under that agency, not just the (login-less) CORPORATE agent itself.
ALTER TABLE "Agent" ADD COLUMN "linked_company_id" UUID;

CREATE INDEX "Agent_linked_company_id_idx" ON "Agent"("linked_company_id");

ALTER TABLE "Agent" ADD CONSTRAINT "Agent_linked_company_id_fkey" FOREIGN KEY ("linked_company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
