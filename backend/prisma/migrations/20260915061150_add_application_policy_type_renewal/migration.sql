-- CreateEnum
CREATE TYPE "ApplicationPolicyType" AS ENUM ('NEW_POLICY', 'RENEWAL');

-- AlterTable
ALTER TABLE "PolicyApplication" ADD COLUMN     "policy_type" "ApplicationPolicyType" NOT NULL DEFAULT 'NEW_POLICY',
ADD COLUMN     "renewed_policy_id" UUID;

-- AddForeignKey
ALTER TABLE "PolicyApplication" ADD CONSTRAINT "PolicyApplication_renewed_policy_id_fkey" FOREIGN KEY ("renewed_policy_id") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
