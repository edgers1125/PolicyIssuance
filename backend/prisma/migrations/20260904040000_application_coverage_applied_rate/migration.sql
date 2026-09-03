-- Freeze the net rate actually applied at submission time on each ApplicationCoverage.
ALTER TABLE "ApplicationCoverage" ADD COLUMN "applied_rate" DECIMAL(10,6) NOT NULL DEFAULT 0;

-- Best-effort backfill for rows that predate this column: use the agent's
-- current override for that coverage if one exists, else the product's standard rate.
UPDATE "ApplicationCoverage" ac
SET "applied_rate" = COALESCE(
  (
    SELECT an.netrate
    FROM "AgentNetrate" an
    JOIN "PolicyApplication" pa ON pa.id = ac.application_id
    WHERE an.agent_id = pa.agent_id AND an.product_coverage_id = ac.coverage_id
    LIMIT 1
  ),
  (SELECT pc.standard_rate FROM "ProductCoverage" pc WHERE pc.id = ac.coverage_id)
);

ALTER TABLE "ApplicationCoverage" ALTER COLUMN "applied_rate" DROP DEFAULT;
