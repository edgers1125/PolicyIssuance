-- ApplicationCoverage: add payable_to_bethel (what's actually owed to Bethel
-- for this row) — backfilled from applied_rate for existing PERCENTAGE/
-- VALUE_PERCENTAGE rows, or from premium_amount for existing FLAT_TIER rows
-- (applied_rate 0), which had no agent margin yet so premium_amount already
-- equaled the tier's price.
ALTER TABLE "ApplicationCoverage" ADD COLUMN "payable_to_bethel" DECIMAL(18,2);

UPDATE "ApplicationCoverage"
SET "payable_to_bethel" = CASE
  WHEN "applied_rate" = 0 THEN "premium_amount"
  ELSE "coverage_amount" * "applied_rate"
END;

ALTER TABLE "ApplicationCoverage" ALTER COLUMN "payable_to_bethel" SET NOT NULL;

-- Replace the direct vehicle_id FK with a reference to this application's own
-- PolicyApplicationVehicle join row, so a coverage row can never point at a
-- vehicle that isn't actually part of the application.
ALTER TABLE "ApplicationCoverage" ADD COLUMN "policy_application_vehicle_id" UUID;

UPDATE "ApplicationCoverage" ac
SET "policy_application_vehicle_id" = pav."id"
FROM "PolicyApplicationVehicle" pav
WHERE pav."policy_application_id" = ac."application_id"
  AND pav."vehicle_id" = ac."vehicle_id";

ALTER TABLE "ApplicationCoverage" DROP CONSTRAINT "ApplicationCoverage_vehicle_id_fkey";
DROP INDEX "ApplicationCoverage_vehicle_id_idx";
ALTER TABLE "ApplicationCoverage" DROP COLUMN "vehicle_id";

CREATE INDEX "ApplicationCoverage_policy_application_vehicle_id_idx" ON "ApplicationCoverage"("policy_application_vehicle_id");

ALTER TABLE "ApplicationCoverage"
  ADD CONSTRAINT "ApplicationCoverage_policy_application_vehicle_id_fkey"
  FOREIGN KEY ("policy_application_vehicle_id") REFERENCES "PolicyApplicationVehicle"("id") ON UPDATE CASCADE ON DELETE SET NULL;

-- PolicyApplication: submission_date is now required — backfill any existing
-- null with application_date as the best available approximation.
UPDATE "PolicyApplication" SET "submission_date" = "application_date" WHERE "submission_date" IS NULL;
ALTER TABLE "PolicyApplication" ALTER COLUMN "submission_date" SET NOT NULL;

-- total_amount is computable from total_premium + doc_stamps + vat + lgt + misc
-- and is no longer stored.
ALTER TABLE "PolicyApplication" DROP COLUMN "total_amount";
