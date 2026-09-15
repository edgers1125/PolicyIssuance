-- DropForeignKey
ALTER TABLE "PartyAddress" DROP CONSTRAINT "PartyAddress_company_id_fkey";

-- DropForeignKey
ALTER TABLE "PartyAddress" DROP CONSTRAINT "PartyAddress_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "PartyVehicle" DROP CONSTRAINT "PartyVehicle_company_id_fkey";

-- DropForeignKey
ALTER TABLE "PartyVehicle" DROP CONSTRAINT "PartyVehicle_customer_id_fkey";

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "estimated_value" DECIMAL(18,2);

-- RenameForeignKey
ALTER TABLE "AgentFlatTierPricing" RENAME CONSTRAINT "AgentFlatTierPricing_period_fkey" TO "AgentFlatTierPricing_coverage_allowable_period_id_fkey";

-- RenameForeignKey
ALTER TABLE "AgentNetrate" RENAME CONSTRAINT "AgentNetrate_period_fkey" TO "AgentNetrate_coverage_allowable_period_id_fkey";

-- RenameForeignKey
ALTER TABLE "AgentValuePercentageTier" RENAME CONSTRAINT "AgentValuePercentageTier_period_fkey" TO "AgentValuePercentageTier_coverage_allowable_period_id_fkey";

-- RenameForeignKey
ALTER TABLE "CoveragePercentageBasedPricing" RENAME CONSTRAINT "CoveragePercentageBasedPricing_period_fkey" TO "CoveragePercentageBasedPricing_coverage_allowable_period_i_fkey";

-- RenameForeignKey
ALTER TABLE "CoverageTierBasedPricing" RENAME CONSTRAINT "CoverageTierBasedPricing_period_fkey" TO "CoverageTierBasedPricing_coverage_allowable_period_id_fkey";

-- RenameForeignKey
ALTER TABLE "CoverageValuePercentageTier" RENAME CONSTRAINT "CoverageValuePercentageTier_period_fkey" TO "CoverageValuePercentageTier_coverage_allowable_period_id_fkey";

-- AddForeignKey
ALTER TABLE "PartyAddress" ADD CONSTRAINT "PartyAddress_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyAddress" ADD CONSTRAINT "PartyAddress_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyVehicle" ADD CONSTRAINT "PartyVehicle_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyVehicle" ADD CONSTRAINT "PartyVehicle_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "AgentFlatTierPricing_agent_period_amount_key" RENAME TO "AgentFlatTierPricing_agent_id_coverage_allowable_period_id__key";

-- RenameIndex
ALTER INDEX "AgentNetrate_agent_period_key" RENAME TO "AgentNetrate_agent_id_coverage_allowable_period_id_key";

-- RenameIndex
ALTER INDEX "AgentValuePercentageTier_agent_period_min_value_key" RENAME TO "AgentValuePercentageTier_agent_id_coverage_allowable_period_key";

-- RenameIndex
ALTER INDEX "CoveragePercentageBasedPricing_period_key" RENAME TO "CoveragePercentageBasedPricing_coverage_allowable_period_id_key";

-- RenameIndex
ALTER INDEX "CoverageTierBasedPricing_period_amount_key" RENAME TO "CoverageTierBasedPricing_coverage_allowable_period_id_cover_key";

-- RenameIndex
ALTER INDEX "CoverageValuePercentageTier_period_min_value_key" RENAME TO "CoverageValuePercentageTier_coverage_allowable_period_id_mi_key";
