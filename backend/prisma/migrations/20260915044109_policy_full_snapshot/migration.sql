-- Everything a re-exported Policy PDF needs, frozen at issuance so it can
-- never drift from what was actually approved — see Policy/PolicyVehicle/
-- PolicyAddress/PolicyCoverage's own field comments in schema/policies.prisma.
--
-- New required columns are added nullable first, backfilled from whatever
-- live data each existing Policy row is still joined to (the closest
-- available approximation of "as of approval" for rows that predate this
-- migration), then locked to NOT NULL.

-- AlterTable: Policy
ALTER TABLE "Policy" ADD COLUMN     "agent_code_snapshot" VARCHAR(50),
ADD COLUMN     "authorized_repair_limit_rate_snapshot" DECIMAL(7,4),
ADD COLUMN     "class_name_snapshot" VARCHAR(100),
ADD COLUMN     "deductible_rate_snapshot" DECIMAL(7,4),
ADD COLUMN     "doc_stamps" DECIMAL(18,2),
ADD COLUMN     "lgt" DECIMAL(18,2),
ADD COLUMN     "misc" DECIMAL(18,2),
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "total_premium" DECIMAL(18,2),
ADD COLUMN     "variant_name_snapshot" VARCHAR(255),
ADD COLUMN     "vat" DECIMAL(18,2);

-- AlterTable: PolicyAddress
ALTER TABLE "PolicyAddress" ADD COLUMN     "formatted_address_snapshot" TEXT;

-- AlterTable: PolicyCoverage
ALTER TABLE "PolicyCoverage" ADD COLUMN     "pricing_mode_snapshot" "CoveragePricingMode";

-- AlterTable: PolicyVehicle
ALTER TABLE "PolicyVehicle" ADD COLUMN     "chassis_number_snapshot" VARCHAR(100),
ADD COLUMN     "color_snapshot" VARCHAR(50),
ADD COLUMN     "engine_number_snapshot" VARCHAR(100),
ADD COLUMN     "make_snapshot" VARCHAR(100),
ADD COLUMN     "model_snapshot" VARCHAR(100),
ADD COLUMN     "mv_file_no_snapshot" VARCHAR(100),
ADD COLUMN     "no_of_seats_snapshot" INTEGER,
ADD COLUMN     "plate_number_snapshot" VARCHAR(50),
ADD COLUMN     "vehicle_type_snapshot" VARCHAR(50),
ADD COLUMN     "year_model_snapshot" INTEGER;

-- Backfill: Policy, off its own product_variant/agent/application
UPDATE "Policy" p
SET
  "class_name_snapshot" = ic.class_name,
  "variant_name_snapshot" = pv.variant_name,
  "deductible_rate_snapshot" = pv.deductible_rate,
  "authorized_repair_limit_rate_snapshot" = pv.authorized_repair_limit_rate,
  "agent_code_snapshot" = a.agent_code,
  "total_premium" = pa.total_premium,
  "doc_stamps" = pa.doc_stamps,
  "vat" = pa.vat,
  "lgt" = pa.lgt,
  "misc" = pa.misc,
  "remarks" = pa.remarks
FROM "ProductVariant" pv, "InsuranceClass" ic, "Agent" a, "PolicyApplication" pa
WHERE pv.id = p.product_variant_id
  AND ic.id = pv.insurance_class_id
  AND a.id = p.agent_id
  AND pa.id = p.application_id;

-- Backfill: PolicyVehicle, off its own vehicle
UPDATE "PolicyVehicle" v
SET
  "plate_number_snapshot" = veh.plate_number,
  "mv_file_no_snapshot" = veh.mv_file_no,
  "engine_number_snapshot" = veh.engine_number,
  "chassis_number_snapshot" = veh.chassis_number,
  "make_snapshot" = veh.make,
  "model_snapshot" = veh.model,
  "year_model_snapshot" = veh.year_model,
  "vehicle_type_snapshot" = veh.vehicle_type,
  "color_snapshot" = veh.color,
  "no_of_seats_snapshot" = veh.no_of_seats
FROM "Vehicle" veh
WHERE veh.id = v.vehicle_id;

-- Backfill: PolicyAddress, off its own address — same comma-joined shape as
-- routes/policyApplications.js's formatAddress() (CONCAT_WS skips NULLs the
-- same way that helper's .filter(Boolean) does).
UPDATE "PolicyAddress" pad
SET "formatted_address_snapshot" = CONCAT_WS(', ',
  addr.address_line_1, addr.address_line_2, addr.barangay,
  addr.city, addr.province, addr.postal_code, addr.country
)
FROM "Address" addr
WHERE addr.id = pad.address_id;

-- Backfill: PolicyCoverage, off its own coverage
UPDATE "PolicyCoverage" pc
SET "pricing_mode_snapshot" = pcov.pricing_mode
FROM "ProductCoverage" pcov
WHERE pcov.id = pc.coverage_id;

-- Lock down required columns now that every existing row has a value.
ALTER TABLE "Policy"
  ALTER COLUMN "class_name_snapshot" SET NOT NULL,
  ALTER COLUMN "variant_name_snapshot" SET NOT NULL,
  ALTER COLUMN "total_premium" SET NOT NULL,
  ALTER COLUMN "doc_stamps" SET NOT NULL,
  ALTER COLUMN "vat" SET NOT NULL,
  ALTER COLUMN "lgt" SET NOT NULL,
  ALTER COLUMN "misc" SET NOT NULL;

ALTER TABLE "PolicyAddress"
  ALTER COLUMN "formatted_address_snapshot" SET NOT NULL;

ALTER TABLE "PolicyCoverage"
  ALTER COLUMN "pricing_mode_snapshot" SET NOT NULL;

ALTER TABLE "PolicyVehicle"
  ALTER COLUMN "mv_file_no_snapshot" SET NOT NULL,
  ALTER COLUMN "engine_number_snapshot" SET NOT NULL,
  ALTER COLUMN "chassis_number_snapshot" SET NOT NULL,
  ALTER COLUMN "no_of_seats_snapshot" SET NOT NULL;
