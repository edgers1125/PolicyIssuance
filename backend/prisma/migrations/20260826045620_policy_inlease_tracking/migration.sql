-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "added_to_inlease" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inlease_added_at" TIMESTAMP(3);
