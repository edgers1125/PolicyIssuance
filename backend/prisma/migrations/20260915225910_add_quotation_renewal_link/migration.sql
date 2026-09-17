-- AlterTable
ALTER TABLE "PolicyQuotation" ADD COLUMN     "renewed_policy_id" UUID;

-- AddForeignKey
ALTER TABLE "PolicyQuotation" ADD CONSTRAINT "PolicyQuotation_renewed_policy_id_fkey" FOREIGN KEY ("renewed_policy_id") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
