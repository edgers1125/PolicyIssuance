-- AlterTable
ALTER TABLE "PolicyApplication"
  ADD COLUMN "coverage_start_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  ADD COLUMN "coverage_end_at" TIMESTAMP(3) NOT NULL DEFAULT (now() + interval '1 year');

-- Drop the defaults so future inserts must supply real values explicitly.
ALTER TABLE "PolicyApplication" ALTER COLUMN "coverage_start_at" DROP DEFAULT;
ALTER TABLE "PolicyApplication" ALTER COLUMN "coverage_end_at" DROP DEFAULT;
