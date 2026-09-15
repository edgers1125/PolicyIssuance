-- CreateEnum
CREATE TYPE "ApplicationChangeType" AS ENUM ('INSURED_FROM_DATE', 'INSURED_NAME_DETAILS', 'INSURED_ADDRESS_DETAILS', 'VEHICLE_MODEL', 'VEHICLE_MV_FILE', 'VEHICLE_PLATE_NO', 'VEHICLE_TYPE', 'VEHICLE_MAKE', 'VEHICLE_COLOR', 'VEHICLE_ENGINE_NO', 'VEHICLE_CHASSIS_NO', 'ADD_CLAUSE', 'REMOVE_CLAUSE');

-- CreateTable
CREATE TABLE "PolicyApplicationChange" (
    "id" UUID NOT NULL,
    "policy_application_id" UUID NOT NULL,
    "application_vehicle_id" UUID,
    "application_coverage_id" UUID,
    "change_type" "ApplicationChangeType" NOT NULL,
    "change_from" TEXT,
    "change_to" TEXT,
    "effective_date" DATE,
    "remarks" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyApplicationChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicyApplicationChange_policy_application_id_idx" ON "PolicyApplicationChange"("policy_application_id");

-- AddForeignKey
ALTER TABLE "PolicyApplicationChange" ADD CONSTRAINT "PolicyApplicationChange_policy_application_id_fkey" FOREIGN KEY ("policy_application_id") REFERENCES "PolicyApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplicationChange" ADD CONSTRAINT "PolicyApplicationChange_application_vehicle_id_fkey" FOREIGN KEY ("application_vehicle_id") REFERENCES "PolicyApplicationVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplicationChange" ADD CONSTRAINT "PolicyApplicationChange_application_coverage_id_fkey" FOREIGN KEY ("application_coverage_id") REFERENCES "ApplicationCoverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplicationChange" ADD CONSTRAINT "PolicyApplicationChange_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
