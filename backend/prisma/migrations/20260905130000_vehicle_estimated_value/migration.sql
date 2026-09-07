-- AlterTable: Vehicle gets an estimated value plus the date that value was
-- first assessed. initial_assessment_date is set automatically by the
-- application (never accepted from client input) the first time an
-- estimated_value is recorded, and is never moved afterward.
ALTER TABLE "Vehicle" ADD COLUMN "estimated_value" DECIMAL(18,2);
ALTER TABLE "Vehicle" ADD COLUMN "initial_assessment_date" DATE;
