-- AlterTable
ALTER TABLE "InLeaseBacklog" ADD COLUMN     "endorsement_request_id" UUID;

-- CreateIndex
CREATE INDEX "InLeaseBacklog_endorsement_request_id_idx" ON "InLeaseBacklog"("endorsement_request_id");

-- AddForeignKey
ALTER TABLE "InLeaseBacklog" ADD CONSTRAINT "InLeaseBacklog_endorsement_request_id_fkey" FOREIGN KEY ("endorsement_request_id") REFERENCES "EndorsementRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "AgentSeatsBasedPricing_agent_id_coverage_allowable_period__key" RENAME TO "AgentSeatsBasedPricing_agent_id_coverage_allowable_period_i_key";

-- RenameIndex
ALTER INDEX "AgentSeatsTierPricing_agent_period_amount_key" RENAME TO "AgentSeatsTierPricing_agent_id_coverage_allowable_period_id_key";

-- RenameIndex
ALTER INDEX "CoverageSeatsTierPricing_period_amount_key" RENAME TO "CoverageSeatsTierPricing_coverage_allowable_period_id_insur_key";
