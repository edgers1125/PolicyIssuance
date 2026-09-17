-- CreateEnum
CREATE TYPE "EndorsementStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EndorsementChangeType" AS ENUM ('POLICY_EFFECTIVE_DATE', 'INSURED_NAME_DETAILS', 'INSURED_ADDRESS_DETAILS', 'VEHICLE_MODEL', 'VEHICLE_MV_FILE', 'VEHICLE_PLATE_NO', 'VEHICLE_TYPE', 'VEHICLE_MAKE', 'VEHICLE_COLOR', 'VEHICLE_ENGINE_NO', 'VEHICLE_CHASSIS_NO', 'ADD_CLAUSE', 'REMOVE_CLAUSE');

-- CreateTable
CREATE TABLE "EndorsementRequest" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "endorsement_number" VARCHAR(60) NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "status" "EndorsementStatus" NOT NULL DEFAULT 'SUBMITTED',
    "effective_date" DATE NOT NULL,
    "remarks" TEXT,
    "send_policy_to_email" BOOLEAN NOT NULL DEFAULT false,
    "send_policy_to_email_on_approval" BOOLEAN NOT NULL DEFAULT false,
    "created_by_agent_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndorsementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndorsementChange" (
    "id" UUID NOT NULL,
    "endorsement_request_id" UUID NOT NULL,
    "policy_vehicle_id" UUID,
    "policy_coverage_id" UUID,
    "change_type" "EndorsementChangeType" NOT NULL,
    "change_from" TEXT,
    "change_to" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndorsementChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndorsementApprovalHistory" (
    "id" UUID NOT NULL,
    "endorsement_request_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comments" TEXT,
    "decision_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EndorsementApprovalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EndorsementRequest_endorsement_number_key" ON "EndorsementRequest"("endorsement_number");
CREATE UNIQUE INDEX "EndorsementRequest_policy_id_sequence_no_key" ON "EndorsementRequest"("policy_id", "sequence_no");
CREATE INDEX "EndorsementRequest_policy_id_idx" ON "EndorsementRequest"("policy_id");
CREATE INDEX "EndorsementRequest_status_idx" ON "EndorsementRequest"("status");

-- CreateIndex
CREATE INDEX "EndorsementChange_endorsement_request_id_idx" ON "EndorsementChange"("endorsement_request_id");

-- CreateIndex
CREATE INDEX "EndorsementApprovalHistory_endorsement_request_id_idx" ON "EndorsementApprovalHistory"("endorsement_request_id");

-- AddForeignKey
ALTER TABLE "EndorsementRequest" ADD CONSTRAINT "EndorsementRequest_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EndorsementRequest" ADD CONSTRAINT "EndorsementRequest_created_by_agent_id_fkey" FOREIGN KEY ("created_by_agent_id") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EndorsementRequest" ADD CONSTRAINT "EndorsementRequest_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndorsementChange" ADD CONSTRAINT "EndorsementChange_endorsement_request_id_fkey" FOREIGN KEY ("endorsement_request_id") REFERENCES "EndorsementRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EndorsementChange" ADD CONSTRAINT "EndorsementChange_policy_vehicle_id_fkey" FOREIGN KEY ("policy_vehicle_id") REFERENCES "PolicyVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EndorsementChange" ADD CONSTRAINT "EndorsementChange_policy_coverage_id_fkey" FOREIGN KEY ("policy_coverage_id") REFERENCES "PolicyCoverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndorsementApprovalHistory" ADD CONSTRAINT "EndorsementApprovalHistory_endorsement_request_id_fkey" FOREIGN KEY ("endorsement_request_id") REFERENCES "EndorsementRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EndorsementApprovalHistory" ADD CONSTRAINT "EndorsementApprovalHistory_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
