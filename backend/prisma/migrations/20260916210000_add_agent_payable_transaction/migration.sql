-- CreateEnum
CREATE TYPE "AgentPayableTransactionType" AS ENUM ('POLICY_COMMISSION', 'PAYMENT');

-- CreateTable
CREATE TABLE "AgentPayableTransaction" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "transaction_type" "AgentPayableTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "policy_id" UUID,
    "endorsement_request_id" UUID,
    "remarks" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentPayableTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentPayableTransaction_agent_id_idx" ON "AgentPayableTransaction"("agent_id");

-- CreateIndex
CREATE INDEX "AgentPayableTransaction_policy_id_idx" ON "AgentPayableTransaction"("policy_id");

-- AddForeignKey
ALTER TABLE "AgentPayableTransaction" ADD CONSTRAINT "AgentPayableTransaction_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPayableTransaction" ADD CONSTRAINT "AgentPayableTransaction_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPayableTransaction" ADD CONSTRAINT "AgentPayableTransaction_endorsement_request_id_fkey" FOREIGN KEY ("endorsement_request_id") REFERENCES "EndorsementRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPayableTransaction" ADD CONSTRAINT "AgentPayableTransaction_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
