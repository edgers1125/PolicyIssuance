-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('RESIDENTIAL', 'OFFICE', 'WAREHOUSE', 'BRANCH', 'RISK_LOCATION');

-- CreateEnum
CREATE TYPE "InsuredType" AS ENUM ('INDIVIDUAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FOR_EDIT_MANAGER', 'FOR_EDIT_UNDERWRITING', 'PENDING_MANAGER_APPROVAL', 'PENDING_UNDERWRITING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'LAPSED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'RETURNED_FOR_EDIT');

-- CreateEnum
CREATE TYPE "CancellationDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL,
    "agent_id" UUID,
    "customer_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "role_name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "permission_code" VARCHAR(100) NOT NULL,
    "permission_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyApplication" (
    "id" UUID NOT NULL,
    "insured_type" "InsuredType" NOT NULL,
    "application_number" VARCHAR(50) NOT NULL,
    "customer_id" UUID,
    "company_id" UUID,
    "company_name_snapshot" VARCHAR(255),
    "agent_id" UUID NOT NULL,
    "agent_name_snapshot" VARCHAR(255),
    "product_variant_id" UUID NOT NULL,
    "application_date" DATE NOT NULL,
    "submission_date" DATE,
    "status" "ApplicationStatus" NOT NULL,
    "remarks" TEXT,
    "document_folder_name" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyApplicationVehicle" (
    "id" UUID NOT NULL,
    "policy_application_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyApplicationVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyApplicationAddress" (
    "id" UUID NOT NULL,
    "policy_application_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyApplicationAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationCoverage" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "coverage_id" UUID NOT NULL,
    "coverage_amount" DECIMAL(18,2) NOT NULL,
    "premium_amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClass" (
    "id" UUID NOT NULL,
    "class_name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "insurance_class_id" UUID NOT NULL,
    "variant_code" VARCHAR(50) NOT NULL,
    "variant_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCoverage" (
    "id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "coverage_code" VARCHAR(50) NOT NULL,
    "coverage_name" VARCHAR(255) NOT NULL,
    "maximum_coverage" DECIMAL(18,2) NOT NULL,
    "status" "RecordStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalHistory" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comments" TEXT,
    "decision_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationHistory" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "decision" "CancellationDecision" NOT NULL,
    "comments" TEXT,
    "decision_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "address_line_1" VARCHAR(255) NOT NULL,
    "address_line_2" VARCHAR(255),
    "barangay" VARCHAR(100),
    "city" VARCHAR(100),
    "province" VARCHAR(100),
    "postal_code" VARCHAR(20),
    "country" VARCHAR(100),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "google_place_id" VARCHAR(255),
    "formatted_address" TEXT,
    "address_type" "AddressType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAddress" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "plate_number" VARCHAR(50),
    "engine_number" VARCHAR(100) NOT NULL,
    "chassis_number" VARCHAR(100) NOT NULL,
    "make" VARCHAR(100),
    "model" VARCHAR(100),
    "year_model" INTEGER,
    "vehicle_type" VARCHAR(50),
    "color" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerVehicle" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "ownership_start_date" DATE,
    "ownership_end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyVehicle" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "ownership_start_date" DATE,
    "ownership_end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "company_code" VARCHAR(50) NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "tin_no" VARCHAR(100),
    "email" VARCHAR(255) NOT NULL,
    "status" "RecordStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "birthday" DATE,
    "gender" VARCHAR(20),
    "email" VARCHAR(255) NOT NULL,
    "mobile_number" VARCHAR(50),
    "company_id" UUID,
    "status" "CustomerStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" UUID NOT NULL,
    "agent_code" VARCHAR(50) NOT NULL,
    "agent_name" VARCHAR(255) NOT NULL,
    "work_email" VARCHAR(255) NOT NULL,
    "status" "RecordStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentNetrate" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "product_coverage_id" UUID NOT NULL,
    "netrate" DECIMAL(10,6) NOT NULL,
    "maximum_coverage" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentNetrate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" UUID NOT NULL,
    "policy_number" VARCHAR(50) NOT NULL,
    "application_id" UUID NOT NULL,
    "customer_id" UUID,
    "company_id" UUID,
    "agent_id" UUID NOT NULL,
    "agent_name_snapshot" VARCHAR(255),
    "product_variant_id" UUID NOT NULL,
    "issue_date" DATE NOT NULL,
    "effective_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "policy_status" "PolicyStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVehicle" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAddress" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyCoverage" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "coverage_id" UUID NOT NULL,
    "coverage_amount" DECIMAL(18,2) NOT NULL,
    "premium_amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Role_role_name_key" ON "Role"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_id_permission_id_key" ON "RolePermission"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "UserRole_user_id_idx" ON "UserRole"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_user_id_role_id_key" ON "UserRole"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "UserPermission_user_id_idx" ON "UserPermission"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_user_id_permission_id_key" ON "UserPermission"("user_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyApplication_application_number_key" ON "PolicyApplication"("application_number");

-- CreateIndex
CREATE INDEX "PolicyApplication_status_idx" ON "PolicyApplication"("status");

-- CreateIndex
CREATE INDEX "PolicyApplication_customer_id_idx" ON "PolicyApplication"("customer_id");

-- CreateIndex
CREATE INDEX "PolicyApplication_company_id_idx" ON "PolicyApplication"("company_id");

-- CreateIndex
CREATE INDEX "PolicyApplication_agent_id_idx" ON "PolicyApplication"("agent_id");

-- CreateIndex
CREATE INDEX "PolicyApplicationVehicle_policy_application_id_idx" ON "PolicyApplicationVehicle"("policy_application_id");

-- CreateIndex
CREATE INDEX "PolicyApplicationAddress_policy_application_id_idx" ON "PolicyApplicationAddress"("policy_application_id");

-- CreateIndex
CREATE INDEX "ApplicationCoverage_application_id_idx" ON "ApplicationCoverage"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_variant_code_key" ON "ProductVariant"("variant_code");

-- CreateIndex
CREATE INDEX "ProductVariant_insurance_class_id_idx" ON "ProductVariant"("insurance_class_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCoverage_coverage_code_key" ON "ProductCoverage"("coverage_code");

-- CreateIndex
CREATE INDEX "ProductCoverage_product_variant_id_idx" ON "ProductCoverage"("product_variant_id");

-- CreateIndex
CREATE INDEX "ApprovalHistory_application_id_idx" ON "ApprovalHistory"("application_id");

-- CreateIndex
CREATE INDEX "CancellationHistory_policy_id_idx" ON "CancellationHistory"("policy_id");

-- CreateIndex
CREATE INDEX "CustomerAddress_customer_id_idx" ON "CustomerAddress"("customer_id");

-- CreateIndex
CREATE INDEX "CompanyAddress_company_id_idx" ON "CompanyAddress"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_engine_number_key" ON "Vehicle"("engine_number");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_chassis_number_key" ON "Vehicle"("chassis_number");

-- CreateIndex
CREATE INDEX "CustomerVehicle_customer_id_idx" ON "CustomerVehicle"("customer_id");

-- CreateIndex
CREATE INDEX "CompanyVehicle_company_id_idx" ON "CompanyVehicle"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "Company_company_code_key" ON "Company"("company_code");

-- CreateIndex
CREATE UNIQUE INDEX "Company_email_key" ON "Company"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_agent_code_key" ON "Agent"("agent_code");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_work_email_key" ON "Agent"("work_email");

-- CreateIndex
CREATE INDEX "AgentNetrate_agent_id_idx" ON "AgentNetrate"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_policy_number_key" ON "Policy"("policy_number");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_application_id_key" ON "Policy"("application_id");

-- CreateIndex
CREATE INDEX "Policy_policy_status_idx" ON "Policy"("policy_status");

-- CreateIndex
CREATE INDEX "Policy_customer_id_idx" ON "Policy"("customer_id");

-- CreateIndex
CREATE INDEX "Policy_company_id_idx" ON "Policy"("company_id");

-- CreateIndex
CREATE INDEX "Policy_agent_id_idx" ON "Policy"("agent_id");

-- CreateIndex
CREATE INDEX "Policy_expiry_date_idx" ON "Policy"("expiry_date");

-- CreateIndex
CREATE INDEX "PolicyVehicle_policy_id_idx" ON "PolicyVehicle"("policy_id");

-- CreateIndex
CREATE INDEX "PolicyAddress_policy_id_idx" ON "PolicyAddress"("policy_id");

-- CreateIndex
CREATE INDEX "PolicyCoverage_policy_id_idx" ON "PolicyCoverage"("policy_id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplication" ADD CONSTRAINT "PolicyApplication_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplication" ADD CONSTRAINT "PolicyApplication_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplication" ADD CONSTRAINT "PolicyApplication_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplication" ADD CONSTRAINT "PolicyApplication_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplicationVehicle" ADD CONSTRAINT "PolicyApplicationVehicle_policy_application_id_fkey" FOREIGN KEY ("policy_application_id") REFERENCES "PolicyApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplicationVehicle" ADD CONSTRAINT "PolicyApplicationVehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplicationAddress" ADD CONSTRAINT "PolicyApplicationAddress_policy_application_id_fkey" FOREIGN KEY ("policy_application_id") REFERENCES "PolicyApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApplicationAddress" ADD CONSTRAINT "PolicyApplicationAddress_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCoverage" ADD CONSTRAINT "ApplicationCoverage_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "PolicyApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCoverage" ADD CONSTRAINT "ApplicationCoverage_coverage_id_fkey" FOREIGN KEY ("coverage_id") REFERENCES "ProductCoverage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_insurance_class_id_fkey" FOREIGN KEY ("insurance_class_id") REFERENCES "InsuranceClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCoverage" ADD CONSTRAINT "ProductCoverage_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalHistory" ADD CONSTRAINT "ApprovalHistory_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "PolicyApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalHistory" ADD CONSTRAINT "ApprovalHistory_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationHistory" ADD CONSTRAINT "CancellationHistory_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationHistory" ADD CONSTRAINT "CancellationHistory_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVehicle" ADD CONSTRAINT "CustomerVehicle_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVehicle" ADD CONSTRAINT "CustomerVehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVehicle" ADD CONSTRAINT "CompanyVehicle_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVehicle" ADD CONSTRAINT "CompanyVehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentNetrate" ADD CONSTRAINT "AgentNetrate_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentNetrate" ADD CONSTRAINT "AgentNetrate_product_coverage_id_fkey" FOREIGN KEY ("product_coverage_id") REFERENCES "ProductCoverage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "PolicyApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVehicle" ADD CONSTRAINT "PolicyVehicle_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVehicle" ADD CONSTRAINT "PolicyVehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAddress" ADD CONSTRAINT "PolicyAddress_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAddress" ADD CONSTRAINT "PolicyAddress_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCoverage" ADD CONSTRAINT "PolicyCoverage_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCoverage" ADD CONSTRAINT "PolicyCoverage_coverage_id_fkey" FOREIGN KEY ("coverage_id") REFERENCES "ProductCoverage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
