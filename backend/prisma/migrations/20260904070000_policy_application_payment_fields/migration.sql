-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHECK', 'CREDIT_CARD', 'BANK_TRANSFER', 'ONLINE_PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentRemittance" AS ENUM ('DIRECT_TO_BETHEL', 'THROUGH_AGENT');

-- Delivery preference, payment method, and who the payment goes to first.
ALTER TABLE "PolicyApplication" ADD COLUMN "send_policy_to_email" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PolicyApplication" ADD COLUMN "payment_method" "PaymentMethod";
ALTER TABLE "PolicyApplication" ADD COLUMN "payment_remittance" "PaymentRemittance";

-- Best-effort backfill for applications submitted before these fields existed.
UPDATE "PolicyApplication" SET "payment_method" = 'CASH' WHERE "payment_method" IS NULL;
UPDATE "PolicyApplication" SET "payment_remittance" = 'DIRECT_TO_BETHEL' WHERE "payment_remittance" IS NULL;

ALTER TABLE "PolicyApplication" ALTER COLUMN "payment_method" SET NOT NULL;
ALTER TABLE "PolicyApplication" ALTER COLUMN "payment_remittance" SET NOT NULL;
