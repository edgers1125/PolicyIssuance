-- MV File No. (LTO motor vehicle file number) is now required per vehicle.
ALTER TABLE "Vehicle" ADD COLUMN "mv_file_no" VARCHAR(100);

-- Placeholder backfill for vehicles entered before this field existed — these
-- aren't real MV File Numbers, just unique stand-ins so the column can be required.
UPDATE "Vehicle" SET "mv_file_no" = 'PENDING-' || "engine_number" WHERE "mv_file_no" IS NULL;

ALTER TABLE "Vehicle" ALTER COLUMN "mv_file_no" SET NOT NULL;
CREATE UNIQUE INDEX "Vehicle_mv_file_no_key" ON "Vehicle"("mv_file_no");
