-- A quotation prices coverages exactly like a PolicyApplication, but never
-- goes through approval, never becomes a Policy, and has no payment method
-- yet — so it gets its own parallel set of tables (PolicyQuotation +
-- vehicle/address/coverage) rather than reusing the application ones.

-- CreateTable
CREATE TABLE "PolicyQuotation" (
    "id" UUID NOT NULL,
    "insured_type" "InsuredType" NOT NULL,
    "quotation_number" VARCHAR(50) NOT NULL,
    "customer_id" UUID,
    "company_id" UUID,
    "company_name_snapshot" VARCHAR(255),
    "agent_id" UUID NOT NULL,
    "agent_name_snapshot" VARCHAR(255),
    "product_variant_id" UUID NOT NULL,
    "coverage_start_at" TIMESTAMP(3) NOT NULL,
    "coverage_end_at" TIMESTAMP(3) NOT NULL,
    "quotation_date" DATE NOT NULL,
    "total_premium" DECIMAL(18,2) NOT NULL,
    "doc_stamps" DECIMAL(18,2) NOT NULL,
    "vat" DECIMAL(18,2) NOT NULL,
    "lgt" DECIMAL(18,2) NOT NULL,
    "misc" DECIMAL(18,2) NOT NULL,
    "send_policy_to_email" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyQuotation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicyQuotation_quotation_number_key" ON "PolicyQuotation"("quotation_number");
CREATE INDEX "PolicyQuotation_customer_id_idx" ON "PolicyQuotation"("customer_id");
CREATE INDEX "PolicyQuotation_company_id_idx" ON "PolicyQuotation"("company_id");
CREATE INDEX "PolicyQuotation_agent_id_idx" ON "PolicyQuotation"("agent_id");

ALTER TABLE "PolicyQuotation" ADD CONSTRAINT "PolicyQuotation_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PolicyQuotation" ADD CONSTRAINT "PolicyQuotation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PolicyQuotation" ADD CONSTRAINT "PolicyQuotation_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PolicyQuotation" ADD CONSTRAINT "PolicyQuotation_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PolicyQuotationVehicle" (
    "id" UUID NOT NULL,
    "policy_quotation_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyQuotationVehicle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PolicyQuotationVehicle_policy_quotation_id_idx" ON "PolicyQuotationVehicle"("policy_quotation_id");

ALTER TABLE "PolicyQuotationVehicle" ADD CONSTRAINT "PolicyQuotationVehicle_policy_quotation_id_fkey" FOREIGN KEY ("policy_quotation_id") REFERENCES "PolicyQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PolicyQuotationVehicle" ADD CONSTRAINT "PolicyQuotationVehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PolicyQuotationAddress" (
    "id" UUID NOT NULL,
    "policy_quotation_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "role" "AddressRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyQuotationAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicyQuotationAddress_policy_quotation_id_role_key" ON "PolicyQuotationAddress"("policy_quotation_id", "role");
CREATE INDEX "PolicyQuotationAddress_policy_quotation_id_idx" ON "PolicyQuotationAddress"("policy_quotation_id");

ALTER TABLE "PolicyQuotationAddress" ADD CONSTRAINT "PolicyQuotationAddress_policy_quotation_id_fkey" FOREIGN KEY ("policy_quotation_id") REFERENCES "PolicyQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PolicyQuotationAddress" ADD CONSTRAINT "PolicyQuotationAddress_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "QuotationCoverage" (
    "id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "coverage_id" UUID NOT NULL,
    "policy_quotation_vehicle_id" UUID,
    "coverage_amount" DECIMAL(18,2) NOT NULL,
    "premium_amount" DECIMAL(18,2) NOT NULL,
    "payable_to_bethel" DECIMAL(18,2) NOT NULL,
    "applied_rate" DECIMAL(10,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationCoverage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuotationCoverage_quotation_id_idx" ON "QuotationCoverage"("quotation_id");
CREATE INDEX "QuotationCoverage_policy_quotation_vehicle_id_idx" ON "QuotationCoverage"("policy_quotation_vehicle_id");

ALTER TABLE "QuotationCoverage" ADD CONSTRAINT "QuotationCoverage_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "PolicyQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationCoverage" ADD CONSTRAINT "QuotationCoverage_coverage_id_fkey" FOREIGN KEY ("coverage_id") REFERENCES "ProductCoverage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationCoverage" ADD CONSTRAINT "QuotationCoverage_policy_quotation_vehicle_id_fkey" FOREIGN KEY ("policy_quotation_vehicle_id") REFERENCES "PolicyQuotationVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
