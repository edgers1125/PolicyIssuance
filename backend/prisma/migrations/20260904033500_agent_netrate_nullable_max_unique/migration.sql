-- maximum_coverage becomes optional: an unset agent override falls back to the
-- product coverage's own maximum_coverage, mirroring the standard_rate fallback.
ALTER TABLE "AgentNetrate" ALTER COLUMN "maximum_coverage" DROP NOT NULL;

-- One rate override per agent per coverage.
ALTER TABLE "AgentNetrate" ADD CONSTRAINT "AgentNetrate_agent_id_product_coverage_id_key" UNIQUE ("agent_id", "product_coverage_id");
