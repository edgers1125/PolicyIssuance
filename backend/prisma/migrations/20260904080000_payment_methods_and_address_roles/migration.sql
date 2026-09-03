-- CreateEnum
CREATE TYPE "AddressRole" AS ENUM ('RISK', 'INSURED');

-- CreateTable
CREATE TABLE "AuthorizedPaymentMethod" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizedPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedPaymentMethod_name_key" ON "AuthorizedPaymentMethod"("name");

-- AlterTable: PolicyApplication gets the optional Bethel payment method link.
ALTER TABLE "PolicyApplication" ADD COLUMN "bethel_payment_method_id" UUID;
ALTER TABLE "PolicyApplication" ADD CONSTRAINT "PolicyApplication_bethel_payment_method_id_fkey"
  FOREIGN KEY ("bethel_payment_method_id") REFERENCES "AuthorizedPaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: PolicyApplicationAddress/PolicyAddress can now carry two roles
-- per application (risk location vs. the address the policy is named on).
ALTER TABLE "PolicyApplicationAddress" ADD COLUMN "role" "AddressRole";
ALTER TABLE "PolicyAddress" ADD COLUMN "role" "AddressRole";

-- Backfill from the existing address's own type — a risk-location address was
-- always used as the RISK role before this column existed, everything else
-- was standing in as the (not-yet-split-out) INSURED address.
UPDATE "PolicyApplicationAddress" paa
SET "role" = CASE WHEN a."address_type" = 'RISK_LOCATION' THEN 'RISK' ELSE 'INSURED' END::"AddressRole"
FROM "Address" a
WHERE a.id = paa."address_id";

UPDATE "PolicyAddress" pa
SET "role" = CASE WHEN a."address_type" = 'RISK_LOCATION' THEN 'RISK' ELSE 'INSURED' END::"AddressRole"
FROM "Address" a
WHERE a.id = pa."address_id";

ALTER TABLE "PolicyApplicationAddress" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "PolicyAddress" ALTER COLUMN "role" SET NOT NULL;

CREATE UNIQUE INDEX "PolicyApplicationAddress_policy_application_id_role_key" ON "PolicyApplicationAddress"("policy_application_id", "role");
CREATE UNIQUE INDEX "PolicyAddress_policy_id_role_key" ON "PolicyAddress"("policy_id", "role");
