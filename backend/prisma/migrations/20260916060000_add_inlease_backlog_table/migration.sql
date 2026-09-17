-- CreateEnum
CREATE TYPE "InLeaseTaskType" AS ENUM ('FOR_UPLOAD', 'FOR_ENDORSEMENT');

-- AlterTable
ALTER TABLE "Policy" DROP COLUMN "added_to_inlease",
DROP COLUMN "inlease_added_at";

-- CreateTable
CREATE TABLE "InLeaseBacklog" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "type" "InLeaseTaskType" NOT NULL,
    "accomplished_by_user_id" UUID,
    "accomplished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InLeaseBacklog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InLeaseBacklog_policy_id_idx" ON "InLeaseBacklog"("policy_id");

-- CreateIndex
CREATE INDEX "InLeaseBacklog_accomplished_by_user_id_idx" ON "InLeaseBacklog"("accomplished_by_user_id");

-- AddForeignKey
ALTER TABLE "InLeaseBacklog" ADD CONSTRAINT "InLeaseBacklog_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InLeaseBacklog" ADD CONSTRAINT "InLeaseBacklog_accomplished_by_user_id_fkey" FOREIGN KEY ("accomplished_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every already-issued policy gets a FOR_UPLOAD task so it appears
-- in the tracker retroactively (the page is meant to be a running list of
-- ALL policies) — unaccomplished, since the old added_to_inlease boolean
-- (dropped above) was never actually read anywhere in the app and so isn't a
-- trustworthy signal that any of these were genuinely already processed.
INSERT INTO "InLeaseBacklog" ("id", "policy_id", "type", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", 'FOR_UPLOAD', "created_at", "created_at"
FROM "Policy";
