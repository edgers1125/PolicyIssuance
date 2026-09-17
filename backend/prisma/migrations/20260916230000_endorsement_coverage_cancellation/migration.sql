-- Endorsements can now add/remove a real PolicyCoverage line (priced through
-- the same rate engine an application/quotation uses) and file a policy
-- cancellation — both financially affect the agent's payable ledger. See
-- EndorsementChangeType/EndorsementRequestType/AgentPayableTransactionType's
-- own comments in enums.prisma for the full design.

-- AlterEnum: EndorsementChangeType — ADD_CLAUSE is renamed EDIT_CLAUSE (still
-- fine-print-text-only), REMOVE_CLAUSE is repurposed to mean "remove this
-- coverage line entirely" (financial), and ADD_COVERAGE/CANCEL_POLICY are new.
BEGIN;
CREATE TYPE "EndorsementChangeType_new" AS ENUM (
  'POLICY_EFFECTIVE_DATE', 'INSURED_NAME_DETAILS', 'INSURED_ADDRESS_DETAILS',
  'VEHICLE_MODEL', 'VEHICLE_MV_FILE', 'VEHICLE_PLATE_NO', 'VEHICLE_TYPE',
  'VEHICLE_MAKE', 'VEHICLE_COLOR', 'VEHICLE_ENGINE_NO', 'VEHICLE_CHASSIS_NO',
  'EDIT_CLAUSE', 'REMOVE_CLAUSE', 'ADD_COVERAGE', 'CANCEL_POLICY'
);
ALTER TABLE "EndorsementChange" ALTER COLUMN "change_type" TYPE "EndorsementChangeType_new" USING (
  CASE WHEN "change_type"::text = 'ADD_CLAUSE' THEN 'EDIT_CLAUSE' ELSE "change_type"::text END
)::"EndorsementChangeType_new";
ALTER TYPE "EndorsementChangeType" RENAME TO "EndorsementChangeType_old";
ALTER TYPE "EndorsementChangeType_new" RENAME TO "EndorsementChangeType";
DROP TYPE "public"."EndorsementChangeType_old";
COMMIT;

-- CreateEnum
CREATE TYPE "EndorsementRequestType" AS ENUM ('CORRECTION', 'CANCELLATION');

-- AlterTable: EndorsementRequest
ALTER TABLE "EndorsementRequest" ADD COLUMN "request_type" "EndorsementRequestType" NOT NULL DEFAULT 'CORRECTION';

-- AlterTable: EndorsementChange — the ADD_COVERAGE/REMOVE_CLAUSE pricing columns
ALTER TABLE "EndorsementChange"
  ADD COLUMN "product_coverage_id" UUID,
  ADD COLUMN "coverage_amount" DECIMAL(18,2),
  ADD COLUMN "premium_amount" DECIMAL(18,2),
  ADD COLUMN "payable_to_bethel" DECIMAL(18,2),
  ADD COLUMN "applied_rate" DECIMAL(10,6),
  ADD COLUMN "is_misc" BOOLEAN,
  ADD COLUMN "created_policy_coverage_id" UUID;

-- AddForeignKey
ALTER TABLE "EndorsementChange" ADD CONSTRAINT "EndorsementChange_product_coverage_id_fkey" FOREIGN KEY ("product_coverage_id") REFERENCES "ProductCoverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: PolicyCoverage — margin snapshot, vehicle scope, and the
-- soft-delete/creation audit pointers ADD_COVERAGE/REMOVE_CLAUSE need
ALTER TABLE "PolicyCoverage"
  ADD COLUMN "payable_to_bethel" DECIMAL(18,2),
  ADD COLUMN "applied_rate" DECIMAL(10,6),
  ADD COLUMN "is_misc_snapshot" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "policy_vehicle_id" UUID,
  ADD COLUMN "added_by_endorsement_id" UUID,
  ADD COLUMN "removed_at" TIMESTAMP(3),
  ADD COLUMN "removed_by_endorsement_id" UUID;

-- CreateIndex
CREATE INDEX "PolicyCoverage_removed_at_idx" ON "PolicyCoverage"("removed_at");

-- Backfill is_misc_snapshot for every already-issued PolicyCoverage row from
-- its own catalog coverage's current is_misc flag — best-effort (nothing
-- recomputes an existing policy's charges unless a future endorsement
-- actually touches its coverages), but keeps the snapshot honest rather than
-- defaulting every historical row to false regardless of its real value.
UPDATE "PolicyCoverage" pc
SET "is_misc_snapshot" = pcov."is_misc"
FROM "ProductCoverage" pcov
WHERE pc."coverage_id" = pcov."id";

-- AlterTable: Policy — when a CANCEL_POLICY endorsement took effect
ALTER TABLE "Policy" ADD COLUMN "cancelled_at" DATE;

-- Relax the AgentPayableTransaction amount-sign CHECK constraint —
-- ENDORSEMENT can now be either sign (ADD_COVERAGE credits, REMOVE_CLAUSE
-- debits); ISSUANCE stays credit-only, CANCELLED_POLICY/PAYMENT stay
-- debit-only. See AgentPayableTransactionType's own schema comment.
ALTER TABLE "AgentPayableTransaction" DROP CONSTRAINT "AgentPayableTransaction_amount_sign_check";
ALTER TABLE "AgentPayableTransaction" ADD CONSTRAINT "AgentPayableTransaction_amount_sign_check" CHECK (
  (transaction_type = 'ISSUANCE' AND amount >= 0)
  OR (transaction_type = 'ENDORSEMENT')
  OR (transaction_type IN ('CANCELLED_POLICY', 'PAYMENT') AND amount <= 0)
);
