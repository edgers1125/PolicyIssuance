-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('INDIVIDUAL', 'CORPORATE');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "agent_type" "AgentType" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "company_id" UUID;

-- CreateIndex
CREATE INDEX "Agent_company_id_idx" ON "Agent"("company_id");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
