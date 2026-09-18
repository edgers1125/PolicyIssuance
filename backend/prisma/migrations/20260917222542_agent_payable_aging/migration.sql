-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "payment_terms_days" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "AgentPayableTransaction" ADD COLUMN     "applies_to_transaction_id" UUID,
ADD COLUMN     "due_date" TIMESTAMP(3),
ADD COLUMN     "remaining_amount" DECIMAL(18,2);

-- CreateIndex
CREATE INDEX "AgentPayableTransaction_due_date_idx" ON "AgentPayableTransaction"("due_date");

-- AddForeignKey
ALTER TABLE "AgentPayableTransaction" ADD CONSTRAINT "AgentPayableTransaction_applies_to_transaction_id_fkey" FOREIGN KEY ("applies_to_transaction_id") REFERENCES "AgentPayableTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
