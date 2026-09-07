-- Adds an optional vehicle scope to ApplicationCoverage: null means the
-- coverage applies to the whole policy (every vehicle on the application).
ALTER TABLE "ApplicationCoverage" ADD COLUMN "vehicle_id" UUID;

CREATE INDEX "ApplicationCoverage_vehicle_id_idx" ON "ApplicationCoverage"("vehicle_id");

ALTER TABLE "ApplicationCoverage"
  ADD CONSTRAINT "ApplicationCoverage_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON UPDATE CASCADE ON DELETE SET NULL;
