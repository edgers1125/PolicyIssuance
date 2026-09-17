-- AlterEnum
BEGIN;
CREATE TYPE "AgentPayableTransactionType_new" AS ENUM ('ISSUANCE', 'ENDORSEMENT', 'CANCELLED_POLICY', 'PAYMENT');
ALTER TABLE "AgentPayableTransaction" ALTER COLUMN "transaction_type" TYPE "AgentPayableTransactionType_new" USING ("transaction_type"::text::"AgentPayableTransactionType_new");
ALTER TYPE "AgentPayableTransactionType" RENAME TO "AgentPayableTransactionType_old";
ALTER TYPE "AgentPayableTransactionType_new" RENAME TO "AgentPayableTransactionType";
DROP TYPE "public"."AgentPayableTransactionType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "payable" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateCheckConstraint
-- Not expressible in schema.prisma (no @@check syntax) — enforced here at
-- the DB level as a second line of defense alongside
-- schemas/agentPayables.js's own zod refinement. ISSUANCE/ENDORSEMENT credit
-- an agent's balance (amount >= 0); CANCELLED_POLICY/PAYMENT debit it
-- (amount <= 0).
ALTER TABLE "AgentPayableTransaction" ADD CONSTRAINT "AgentPayableTransaction_amount_sign_check" CHECK (
  (transaction_type IN ('ISSUANCE', 'ENDORSEMENT') AND amount >= 0)
  OR
  (transaction_type IN ('CANCELLED_POLICY', 'PAYMENT') AND amount <= 0)
);
