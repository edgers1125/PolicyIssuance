--
-- PostgreSQL database dump
--

\restrict 4Uibl9sHBm8Pl2K48mTnIElMdgKRd1duzS3PmrgrlpbP3ghLkuSUfBZ1bmXkWTF

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public."Vehicle" DROP CONSTRAINT IF EXISTS "Vehicle_product_variant_id_fkey";
ALTER TABLE IF EXISTS ONLY public."User" DROP CONSTRAINT IF EXISTS "User_customer_id_fkey";
ALTER TABLE IF EXISTS ONLY public."User" DROP CONSTRAINT IF EXISTS "User_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."UserRole" DROP CONSTRAINT IF EXISTS "UserRole_user_id_fkey";
ALTER TABLE IF EXISTS ONLY public."UserRole" DROP CONSTRAINT IF EXISTS "UserRole_role_id_fkey";
ALTER TABLE IF EXISTS ONLY public."UserPermission" DROP CONSTRAINT IF EXISTS "UserPermission_user_id_fkey";
ALTER TABLE IF EXISTS ONLY public."UserPermission" DROP CONSTRAINT IF EXISTS "UserPermission_permission_id_fkey";
ALTER TABLE IF EXISTS ONLY public."RolePermission" DROP CONSTRAINT IF EXISTS "RolePermission_role_id_fkey";
ALTER TABLE IF EXISTS ONLY public."RolePermission" DROP CONSTRAINT IF EXISTS "RolePermission_permission_id_fkey";
ALTER TABLE IF EXISTS ONLY public."QuotationCoverage" DROP CONSTRAINT IF EXISTS "QuotationCoverage_quotation_id_fkey";
ALTER TABLE IF EXISTS ONLY public."QuotationCoverage" DROP CONSTRAINT IF EXISTS "QuotationCoverage_policy_quotation_vehicle_id_fkey";
ALTER TABLE IF EXISTS ONLY public."QuotationCoverage" DROP CONSTRAINT IF EXISTS "QuotationCoverage_coverage_id_fkey";
ALTER TABLE IF EXISTS ONLY public."ProductVariant" DROP CONSTRAINT IF EXISTS "ProductVariant_insurance_class_id_fkey";
ALTER TABLE IF EXISTS ONLY public."ProductVariant" DROP CONSTRAINT IF EXISTS "ProductVariant_gross_target_coverage_id_fkey";
ALTER TABLE IF EXISTS ONLY public."ProductCoverage" DROP CONSTRAINT IF EXISTS "ProductCoverage_product_variant_id_fkey";
ALTER TABLE IF EXISTS ONLY public."Policy" DROP CONSTRAINT IF EXISTS "Policy_product_variant_id_fkey";
ALTER TABLE IF EXISTS ONLY public."Policy" DROP CONSTRAINT IF EXISTS "Policy_customer_id_fkey";
ALTER TABLE IF EXISTS ONLY public."Policy" DROP CONSTRAINT IF EXISTS "Policy_company_id_fkey";
ALTER TABLE IF EXISTS ONLY public."Policy" DROP CONSTRAINT IF EXISTS "Policy_application_id_fkey";
ALTER TABLE IF EXISTS ONLY public."Policy" DROP CONSTRAINT IF EXISTS "Policy_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyVehicle" DROP CONSTRAINT IF EXISTS "PolicyVehicle_vehicle_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyVehicle" DROP CONSTRAINT IF EXISTS "PolicyVehicle_policy_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotation" DROP CONSTRAINT IF EXISTS "PolicyQuotation_renewed_policy_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotation" DROP CONSTRAINT IF EXISTS "PolicyQuotation_product_variant_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotation" DROP CONSTRAINT IF EXISTS "PolicyQuotation_customer_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotation" DROP CONSTRAINT IF EXISTS "PolicyQuotation_company_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotation" DROP CONSTRAINT IF EXISTS "PolicyQuotation_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotationVehicle" DROP CONSTRAINT IF EXISTS "PolicyQuotationVehicle_vehicle_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotationVehicle" DROP CONSTRAINT IF EXISTS "PolicyQuotationVehicle_policy_quotation_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotationAddress" DROP CONSTRAINT IF EXISTS "PolicyQuotationAddress_policy_quotation_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotationAddress" DROP CONSTRAINT IF EXISTS "PolicyQuotationAddress_address_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyCoverage" DROP CONSTRAINT IF EXISTS "PolicyCoverage_policy_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyCoverage" DROP CONSTRAINT IF EXISTS "PolicyCoverage_coverage_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplication" DROP CONSTRAINT IF EXISTS "PolicyApplication_source_quotation_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplication" DROP CONSTRAINT IF EXISTS "PolicyApplication_renewed_policy_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplication" DROP CONSTRAINT IF EXISTS "PolicyApplication_product_variant_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplication" DROP CONSTRAINT IF EXISTS "PolicyApplication_customer_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplication" DROP CONSTRAINT IF EXISTS "PolicyApplication_company_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplication" DROP CONSTRAINT IF EXISTS "PolicyApplication_bethel_payment_method_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplication" DROP CONSTRAINT IF EXISTS "PolicyApplication_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationVehicle" DROP CONSTRAINT IF EXISTS "PolicyApplicationVehicle_vehicle_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationVehicle" DROP CONSTRAINT IF EXISTS "PolicyApplicationVehicle_policy_application_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationChange" DROP CONSTRAINT IF EXISTS "PolicyApplicationChange_policy_application_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationChange" DROP CONSTRAINT IF EXISTS "PolicyApplicationChange_created_by_user_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationChange" DROP CONSTRAINT IF EXISTS "PolicyApplicationChange_application_vehicle_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationChange" DROP CONSTRAINT IF EXISTS "PolicyApplicationChange_application_coverage_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationAddress" DROP CONSTRAINT IF EXISTS "PolicyApplicationAddress_policy_application_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationAddress" DROP CONSTRAINT IF EXISTS "PolicyApplicationAddress_address_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyAddress" DROP CONSTRAINT IF EXISTS "PolicyAddress_policy_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PolicyAddress" DROP CONSTRAINT IF EXISTS "PolicyAddress_address_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PartyVehicle" DROP CONSTRAINT IF EXISTS "PartyVehicle_vehicle_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PartyVehicle" DROP CONSTRAINT IF EXISTS "PartyVehicle_customer_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PartyVehicle" DROP CONSTRAINT IF EXISTS "PartyVehicle_company_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PartyAddress" DROP CONSTRAINT IF EXISTS "PartyAddress_customer_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PartyAddress" DROP CONSTRAINT IF EXISTS "PartyAddress_company_id_fkey";
ALTER TABLE IF EXISTS ONLY public."PartyAddress" DROP CONSTRAINT IF EXISTS "PartyAddress_address_id_fkey";
ALTER TABLE IF EXISTS ONLY public."InLeaseBacklog" DROP CONSTRAINT IF EXISTS "InLeaseBacklog_policy_id_fkey";
ALTER TABLE IF EXISTS ONLY public."InLeaseBacklog" DROP CONSTRAINT IF EXISTS "InLeaseBacklog_endorsement_request_id_fkey";
ALTER TABLE IF EXISTS ONLY public."InLeaseBacklog" DROP CONSTRAINT IF EXISTS "InLeaseBacklog_accomplished_by_user_id_fkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementRequest" DROP CONSTRAINT IF EXISTS "EndorsementRequest_policy_id_fkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementRequest" DROP CONSTRAINT IF EXISTS "EndorsementRequest_created_by_user_id_fkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementRequest" DROP CONSTRAINT IF EXISTS "EndorsementRequest_created_by_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementChange" DROP CONSTRAINT IF EXISTS "EndorsementChange_product_coverage_id_fkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementChange" DROP CONSTRAINT IF EXISTS "EndorsementChange_policy_vehicle_id_fkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementChange" DROP CONSTRAINT IF EXISTS "EndorsementChange_policy_coverage_id_fkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementChange" DROP CONSTRAINT IF EXISTS "EndorsementChange_endorsement_request_id_fkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementApprovalHistory" DROP CONSTRAINT IF EXISTS "EndorsementApprovalHistory_endorsement_request_id_fkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementApprovalHistory" DROP CONSTRAINT IF EXISTS "EndorsementApprovalHistory_approver_id_fkey";
ALTER TABLE IF EXISTS ONLY public."Customer" DROP CONSTRAINT IF EXISTS "Customer_company_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CustomerAgent" DROP CONSTRAINT IF EXISTS "CustomerAgent_customer_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CustomerAgent" DROP CONSTRAINT IF EXISTS "CustomerAgent_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CoverageValuePercentageTier" DROP CONSTRAINT IF EXISTS "CoverageValuePercentageTier_coverage_allowable_period_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CoverageTierBasedPricing" DROP CONSTRAINT IF EXISTS "CoverageTierBasedPricing_coverage_allowable_period_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CoverageSeatsTierPricing" DROP CONSTRAINT IF EXISTS "CoverageSeatsTierPricing_coverage_allowable_period_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CoverageSeatsBasedPricing" DROP CONSTRAINT IF EXISTS "CoverageSeatsBasedPricing_coverage_allowable_period_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CoveragePercentageBasedPricing" DROP CONSTRAINT IF EXISTS "CoveragePercentageBasedPricing_coverage_allowable_period_i_fkey";
ALTER TABLE IF EXISTS ONLY public."CoverageAllowablePeriod" DROP CONSTRAINT IF EXISTS "CoverageAllowablePeriod_coverage_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CompanyAgent" DROP CONSTRAINT IF EXISTS "CompanyAgent_company_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CompanyAgent" DROP CONSTRAINT IF EXISTS "CompanyAgent_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CancellationHistory" DROP CONSTRAINT IF EXISTS "CancellationHistory_policy_id_fkey";
ALTER TABLE IF EXISTS ONLY public."CancellationHistory" DROP CONSTRAINT IF EXISTS "CancellationHistory_approver_id_fkey";
ALTER TABLE IF EXISTS ONLY public."ApprovalHistory" DROP CONSTRAINT IF EXISTS "ApprovalHistory_approver_id_fkey";
ALTER TABLE IF EXISTS ONLY public."ApprovalHistory" DROP CONSTRAINT IF EXISTS "ApprovalHistory_application_id_fkey";
ALTER TABLE IF EXISTS ONLY public."ApplicationCoverage" DROP CONSTRAINT IF EXISTS "ApplicationCoverage_policy_application_vehicle_id_fkey";
ALTER TABLE IF EXISTS ONLY public."ApplicationCoverage" DROP CONSTRAINT IF EXISTS "ApplicationCoverage_coverage_id_fkey";
ALTER TABLE IF EXISTS ONLY public."ApplicationCoverage" DROP CONSTRAINT IF EXISTS "ApplicationCoverage_application_id_fkey";
ALTER TABLE IF EXISTS ONLY public."Agent" DROP CONSTRAINT IF EXISTS "Agent_linked_company_id_fkey";
ALTER TABLE IF EXISTS ONLY public."Agent" DROP CONSTRAINT IF EXISTS "Agent_company_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentValuePercentageTier" DROP CONSTRAINT IF EXISTS "AgentValuePercentageTier_coverage_allowable_period_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentValuePercentageTier" DROP CONSTRAINT IF EXISTS "AgentValuePercentageTier_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentSeatsTierPricing" DROP CONSTRAINT IF EXISTS "AgentSeatsTierPricing_coverage_allowable_period_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentSeatsTierPricing" DROP CONSTRAINT IF EXISTS "AgentSeatsTierPricing_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentSeatsBasedPricing" DROP CONSTRAINT IF EXISTS "AgentSeatsBasedPricing_coverage_allowable_period_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentSeatsBasedPricing" DROP CONSTRAINT IF EXISTS "AgentSeatsBasedPricing_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentPayableTransaction" DROP CONSTRAINT IF EXISTS "AgentPayableTransaction_policy_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentPayableTransaction" DROP CONSTRAINT IF EXISTS "AgentPayableTransaction_endorsement_request_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentPayableTransaction" DROP CONSTRAINT IF EXISTS "AgentPayableTransaction_created_by_user_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentPayableTransaction" DROP CONSTRAINT IF EXISTS "AgentPayableTransaction_applies_to_transaction_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentPayableTransaction" DROP CONSTRAINT IF EXISTS "AgentPayableTransaction_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentNetrate" DROP CONSTRAINT IF EXISTS "AgentNetrate_coverage_allowable_period_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentNetrate" DROP CONSTRAINT IF EXISTS "AgentNetrate_agent_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentFlatTierPricing" DROP CONSTRAINT IF EXISTS "AgentFlatTierPricing_coverage_allowable_period_id_fkey";
ALTER TABLE IF EXISTS ONLY public."AgentFlatTierPricing" DROP CONSTRAINT IF EXISTS "AgentFlatTierPricing_agent_id_fkey";
DROP INDEX IF EXISTS public."Vehicle_product_variant_id_idx";
DROP INDEX IF EXISTS public."Vehicle_plate_number_key";
DROP INDEX IF EXISTS public."Vehicle_mv_file_no_key";
DROP INDEX IF EXISTS public."Vehicle_engine_number_key";
DROP INDEX IF EXISTS public."Vehicle_chassis_number_key";
DROP INDEX IF EXISTS public."User_status_idx";
DROP INDEX IF EXISTS public."User_invite_token_key";
DROP INDEX IF EXISTS public."User_email_key";
DROP INDEX IF EXISTS public."UserRole_user_id_role_id_key";
DROP INDEX IF EXISTS public."UserRole_user_id_idx";
DROP INDEX IF EXISTS public."UserPermission_user_id_permission_id_key";
DROP INDEX IF EXISTS public."UserPermission_user_id_idx";
DROP INDEX IF EXISTS public."Role_role_name_key";
DROP INDEX IF EXISTS public."RolePermission_role_id_permission_id_key";
DROP INDEX IF EXISTS public."QuotationCoverage_quotation_id_idx";
DROP INDEX IF EXISTS public."QuotationCoverage_policy_quotation_vehicle_id_idx";
DROP INDEX IF EXISTS public."ProductVariant_variant_code_key";
DROP INDEX IF EXISTS public."ProductVariant_insurance_class_id_idx";
DROP INDEX IF EXISTS public."ProductCoverage_product_variant_id_idx";
DROP INDEX IF EXISTS public."ProductCoverage_coverage_code_key";
DROP INDEX IF EXISTS public."Policy_policy_status_idx";
DROP INDEX IF EXISTS public."Policy_policy_number_key";
DROP INDEX IF EXISTS public."Policy_expiry_date_idx";
DROP INDEX IF EXISTS public."Policy_customer_id_idx";
DROP INDEX IF EXISTS public."Policy_company_id_idx";
DROP INDEX IF EXISTS public."Policy_application_id_key";
DROP INDEX IF EXISTS public."Policy_agent_id_idx";
DROP INDEX IF EXISTS public."PolicyVehicle_policy_id_idx";
DROP INDEX IF EXISTS public."PolicyQuotation_quotation_number_key";
DROP INDEX IF EXISTS public."PolicyQuotation_customer_id_idx";
DROP INDEX IF EXISTS public."PolicyQuotation_company_id_idx";
DROP INDEX IF EXISTS public."PolicyQuotation_agent_id_idx";
DROP INDEX IF EXISTS public."PolicyQuotationVehicle_policy_quotation_id_idx";
DROP INDEX IF EXISTS public."PolicyQuotationAddress_policy_quotation_id_role_key";
DROP INDEX IF EXISTS public."PolicyQuotationAddress_policy_quotation_id_idx";
DROP INDEX IF EXISTS public."PolicyCoverage_removed_at_idx";
DROP INDEX IF EXISTS public."PolicyCoverage_policy_id_idx";
DROP INDEX IF EXISTS public."PolicyApplication_status_idx";
DROP INDEX IF EXISTS public."PolicyApplication_source_quotation_id_key";
DROP INDEX IF EXISTS public."PolicyApplication_customer_id_idx";
DROP INDEX IF EXISTS public."PolicyApplication_company_id_idx";
DROP INDEX IF EXISTS public."PolicyApplication_application_number_key";
DROP INDEX IF EXISTS public."PolicyApplication_agent_id_idx";
DROP INDEX IF EXISTS public."PolicyApplicationVehicle_policy_application_id_idx";
DROP INDEX IF EXISTS public."PolicyApplicationChange_policy_application_id_idx";
DROP INDEX IF EXISTS public."PolicyApplicationAddress_policy_application_id_role_key";
DROP INDEX IF EXISTS public."PolicyApplicationAddress_policy_application_id_idx";
DROP INDEX IF EXISTS public."PolicyAddress_policy_id_role_key";
DROP INDEX IF EXISTS public."PolicyAddress_policy_id_idx";
DROP INDEX IF EXISTS public."Permission_permission_code_key";
DROP INDEX IF EXISTS public."PartyVehicle_customer_id_idx";
DROP INDEX IF EXISTS public."PartyVehicle_company_id_idx";
DROP INDEX IF EXISTS public."PartyAddress_customer_id_idx";
DROP INDEX IF EXISTS public."PartyAddress_company_id_idx";
DROP INDEX IF EXISTS public."InsuranceClass_class_name_key";
DROP INDEX IF EXISTS public."InLeaseBacklog_policy_id_idx";
DROP INDEX IF EXISTS public."InLeaseBacklog_endorsement_request_id_idx";
DROP INDEX IF EXISTS public."InLeaseBacklog_accomplished_by_user_id_idx";
DROP INDEX IF EXISTS public."EndorsementRequest_status_idx";
DROP INDEX IF EXISTS public."EndorsementRequest_policy_id_sequence_no_key";
DROP INDEX IF EXISTS public."EndorsementRequest_policy_id_idx";
DROP INDEX IF EXISTS public."EndorsementRequest_endorsement_number_key";
DROP INDEX IF EXISTS public."EndorsementChange_endorsement_request_id_idx";
DROP INDEX IF EXISTS public."EndorsementApprovalHistory_endorsement_request_id_idx";
DROP INDEX IF EXISTS public."Customer_mobile_number_key";
DROP INDEX IF EXISTS public."Customer_email_key";
DROP INDEX IF EXISTS public."CustomerAgent_customer_id_agent_id_key";
DROP INDEX IF EXISTS public."CustomerAgent_agent_id_idx";
DROP INDEX IF EXISTS public."CoverageValuePercentageTier_coverage_allowable_period_id_mi_key";
DROP INDEX IF EXISTS public."CoverageTierBasedPricing_coverage_allowable_period_id_cover_key";
DROP INDEX IF EXISTS public."CoverageSeatsTierPricing_coverage_allowable_period_id_insur_key";
DROP INDEX IF EXISTS public."CoverageSeatsBasedPricing_coverage_allowable_period_id_key";
DROP INDEX IF EXISTS public."CoveragePercentageBasedPricing_coverage_allowable_period_id_key";
DROP INDEX IF EXISTS public."CoverageAllowablePeriod_coverage_id_idx";
DROP INDEX IF EXISTS public."CoverageAllowablePeriod_coverage_id_coverage_in_days_key";
DROP INDEX IF EXISTS public."Company_email_key";
DROP INDEX IF EXISTS public."Company_company_code_key";
DROP INDEX IF EXISTS public."CompanyAgent_company_id_agent_id_key";
DROP INDEX IF EXISTS public."CompanyAgent_agent_id_idx";
DROP INDEX IF EXISTS public."CancellationHistory_policy_id_idx";
DROP INDEX IF EXISTS public."AuthorizedPaymentMethod_name_key";
DROP INDEX IF EXISTS public."ApprovalHistory_application_id_idx";
DROP INDEX IF EXISTS public."ApplicationCoverage_policy_application_vehicle_id_idx";
DROP INDEX IF EXISTS public."ApplicationCoverage_application_id_idx";
DROP INDEX IF EXISTS public."Agent_work_email_key";
DROP INDEX IF EXISTS public."Agent_linked_company_id_idx";
DROP INDEX IF EXISTS public."Agent_company_id_idx";
DROP INDEX IF EXISTS public."Agent_agent_code_key";
DROP INDEX IF EXISTS public."AgentValuePercentageTier_agent_id_idx";
DROP INDEX IF EXISTS public."AgentValuePercentageTier_agent_id_coverage_allowable_period_key";
DROP INDEX IF EXISTS public."AgentSeatsTierPricing_agent_id_idx";
DROP INDEX IF EXISTS public."AgentSeatsTierPricing_agent_id_coverage_allowable_period_id_key";
DROP INDEX IF EXISTS public."AgentSeatsBasedPricing_agent_id_idx";
DROP INDEX IF EXISTS public."AgentSeatsBasedPricing_agent_id_coverage_allowable_period_i_key";
DROP INDEX IF EXISTS public."AgentPayableTransaction_policy_id_idx";
DROP INDEX IF EXISTS public."AgentPayableTransaction_due_date_idx";
DROP INDEX IF EXISTS public."AgentPayableTransaction_agent_id_idx";
DROP INDEX IF EXISTS public."AgentNetrate_agent_id_idx";
DROP INDEX IF EXISTS public."AgentNetrate_agent_id_coverage_allowable_period_id_key";
DROP INDEX IF EXISTS public."AgentFlatTierPricing_agent_id_idx";
DROP INDEX IF EXISTS public."AgentFlatTierPricing_agent_id_coverage_allowable_period_id__key";
ALTER TABLE IF EXISTS ONLY public._prisma_migrations DROP CONSTRAINT IF EXISTS _prisma_migrations_pkey;
ALTER TABLE IF EXISTS ONLY public."Vehicle" DROP CONSTRAINT IF EXISTS "Vehicle_pkey";
ALTER TABLE IF EXISTS ONLY public."User" DROP CONSTRAINT IF EXISTS "User_pkey";
ALTER TABLE IF EXISTS ONLY public."UserRole" DROP CONSTRAINT IF EXISTS "UserRole_pkey";
ALTER TABLE IF EXISTS ONLY public."UserPermission" DROP CONSTRAINT IF EXISTS "UserPermission_pkey";
ALTER TABLE IF EXISTS ONLY public."Role" DROP CONSTRAINT IF EXISTS "Role_pkey";
ALTER TABLE IF EXISTS ONLY public."RolePermission" DROP CONSTRAINT IF EXISTS "RolePermission_pkey";
ALTER TABLE IF EXISTS ONLY public."QuotationCoverage" DROP CONSTRAINT IF EXISTS "QuotationCoverage_pkey";
ALTER TABLE IF EXISTS ONLY public."ProductVariant" DROP CONSTRAINT IF EXISTS "ProductVariant_pkey";
ALTER TABLE IF EXISTS ONLY public."ProductCoverage" DROP CONSTRAINT IF EXISTS "ProductCoverage_pkey";
ALTER TABLE IF EXISTS ONLY public."Policy" DROP CONSTRAINT IF EXISTS "Policy_pkey";
ALTER TABLE IF EXISTS ONLY public."PolicyVehicle" DROP CONSTRAINT IF EXISTS "PolicyVehicle_pkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotation" DROP CONSTRAINT IF EXISTS "PolicyQuotation_pkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotationVehicle" DROP CONSTRAINT IF EXISTS "PolicyQuotationVehicle_pkey";
ALTER TABLE IF EXISTS ONLY public."PolicyQuotationAddress" DROP CONSTRAINT IF EXISTS "PolicyQuotationAddress_pkey";
ALTER TABLE IF EXISTS ONLY public."PolicyCoverage" DROP CONSTRAINT IF EXISTS "PolicyCoverage_pkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplication" DROP CONSTRAINT IF EXISTS "PolicyApplication_pkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationVehicle" DROP CONSTRAINT IF EXISTS "PolicyApplicationVehicle_pkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationChange" DROP CONSTRAINT IF EXISTS "PolicyApplicationChange_pkey";
ALTER TABLE IF EXISTS ONLY public."PolicyApplicationAddress" DROP CONSTRAINT IF EXISTS "PolicyApplicationAddress_pkey";
ALTER TABLE IF EXISTS ONLY public."PolicyAddress" DROP CONSTRAINT IF EXISTS "PolicyAddress_pkey";
ALTER TABLE IF EXISTS ONLY public."Permission" DROP CONSTRAINT IF EXISTS "Permission_pkey";
ALTER TABLE IF EXISTS ONLY public."PartyVehicle" DROP CONSTRAINT IF EXISTS "PartyVehicle_pkey";
ALTER TABLE IF EXISTS ONLY public."PartyAddress" DROP CONSTRAINT IF EXISTS "PartyAddress_pkey";
ALTER TABLE IF EXISTS ONLY public."InsuranceClass" DROP CONSTRAINT IF EXISTS "InsuranceClass_pkey";
ALTER TABLE IF EXISTS ONLY public."InLeaseBacklog" DROP CONSTRAINT IF EXISTS "InLeaseBacklog_pkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementRequest" DROP CONSTRAINT IF EXISTS "EndorsementRequest_pkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementChange" DROP CONSTRAINT IF EXISTS "EndorsementChange_pkey";
ALTER TABLE IF EXISTS ONLY public."EndorsementApprovalHistory" DROP CONSTRAINT IF EXISTS "EndorsementApprovalHistory_pkey";
ALTER TABLE IF EXISTS ONLY public."Customer" DROP CONSTRAINT IF EXISTS "Customer_pkey";
ALTER TABLE IF EXISTS ONLY public."CustomerAgent" DROP CONSTRAINT IF EXISTS "CustomerAgent_pkey";
ALTER TABLE IF EXISTS ONLY public."CoverageValuePercentageTier" DROP CONSTRAINT IF EXISTS "CoverageValuePercentageTier_pkey";
ALTER TABLE IF EXISTS ONLY public."CoverageTierBasedPricing" DROP CONSTRAINT IF EXISTS "CoverageTierBasedPricing_pkey";
ALTER TABLE IF EXISTS ONLY public."CoverageSeatsTierPricing" DROP CONSTRAINT IF EXISTS "CoverageSeatsTierPricing_pkey";
ALTER TABLE IF EXISTS ONLY public."CoverageSeatsBasedPricing" DROP CONSTRAINT IF EXISTS "CoverageSeatsBasedPricing_pkey";
ALTER TABLE IF EXISTS ONLY public."CoveragePercentageBasedPricing" DROP CONSTRAINT IF EXISTS "CoveragePercentageBasedPricing_pkey";
ALTER TABLE IF EXISTS ONLY public."CoverageAllowablePeriod" DROP CONSTRAINT IF EXISTS "CoverageAllowablePeriod_pkey";
ALTER TABLE IF EXISTS ONLY public."Company" DROP CONSTRAINT IF EXISTS "Company_pkey";
ALTER TABLE IF EXISTS ONLY public."CompanyAgent" DROP CONSTRAINT IF EXISTS "CompanyAgent_pkey";
ALTER TABLE IF EXISTS ONLY public."CancellationHistory" DROP CONSTRAINT IF EXISTS "CancellationHistory_pkey";
ALTER TABLE IF EXISTS ONLY public."AuthorizedPaymentMethod" DROP CONSTRAINT IF EXISTS "AuthorizedPaymentMethod_pkey";
ALTER TABLE IF EXISTS ONLY public."ApprovalHistory" DROP CONSTRAINT IF EXISTS "ApprovalHistory_pkey";
ALTER TABLE IF EXISTS ONLY public."ApplicationCoverage" DROP CONSTRAINT IF EXISTS "ApplicationCoverage_pkey";
ALTER TABLE IF EXISTS ONLY public."Agent" DROP CONSTRAINT IF EXISTS "Agent_pkey";
ALTER TABLE IF EXISTS ONLY public."AgentValuePercentageTier" DROP CONSTRAINT IF EXISTS "AgentValuePercentageTier_pkey";
ALTER TABLE IF EXISTS ONLY public."AgentSeatsTierPricing" DROP CONSTRAINT IF EXISTS "AgentSeatsTierPricing_pkey";
ALTER TABLE IF EXISTS ONLY public."AgentSeatsBasedPricing" DROP CONSTRAINT IF EXISTS "AgentSeatsBasedPricing_pkey";
ALTER TABLE IF EXISTS ONLY public."AgentPayableTransaction" DROP CONSTRAINT IF EXISTS "AgentPayableTransaction_pkey";
ALTER TABLE IF EXISTS ONLY public."AgentNetrate" DROP CONSTRAINT IF EXISTS "AgentNetrate_pkey";
ALTER TABLE IF EXISTS ONLY public."AgentFlatTierPricing" DROP CONSTRAINT IF EXISTS "AgentFlatTierPricing_pkey";
ALTER TABLE IF EXISTS ONLY public."Address" DROP CONSTRAINT IF EXISTS "Address_pkey";
DROP TABLE IF EXISTS public._prisma_migrations;
DROP TABLE IF EXISTS public."Vehicle";
DROP TABLE IF EXISTS public."UserRole";
DROP TABLE IF EXISTS public."UserPermission";
DROP TABLE IF EXISTS public."User";
DROP TABLE IF EXISTS public."RolePermission";
DROP TABLE IF EXISTS public."Role";
DROP TABLE IF EXISTS public."QuotationCoverage";
DROP TABLE IF EXISTS public."ProductVariant";
DROP TABLE IF EXISTS public."ProductCoverage";
DROP TABLE IF EXISTS public."PolicyVehicle";
DROP TABLE IF EXISTS public."PolicyQuotationVehicle";
DROP TABLE IF EXISTS public."PolicyQuotationAddress";
DROP TABLE IF EXISTS public."PolicyQuotation";
DROP TABLE IF EXISTS public."PolicyCoverage";
DROP TABLE IF EXISTS public."PolicyApplicationVehicle";
DROP TABLE IF EXISTS public."PolicyApplicationChange";
DROP TABLE IF EXISTS public."PolicyApplicationAddress";
DROP TABLE IF EXISTS public."PolicyApplication";
DROP TABLE IF EXISTS public."PolicyAddress";
DROP TABLE IF EXISTS public."Policy";
DROP TABLE IF EXISTS public."Permission";
DROP TABLE IF EXISTS public."PartyVehicle";
DROP TABLE IF EXISTS public."PartyAddress";
DROP TABLE IF EXISTS public."InsuranceClass";
DROP TABLE IF EXISTS public."InLeaseBacklog";
DROP TABLE IF EXISTS public."EndorsementRequest";
DROP TABLE IF EXISTS public."EndorsementChange";
DROP TABLE IF EXISTS public."EndorsementApprovalHistory";
DROP TABLE IF EXISTS public."CustomerAgent";
DROP TABLE IF EXISTS public."Customer";
DROP TABLE IF EXISTS public."CoverageValuePercentageTier";
DROP TABLE IF EXISTS public."CoverageTierBasedPricing";
DROP TABLE IF EXISTS public."CoverageSeatsTierPricing";
DROP TABLE IF EXISTS public."CoverageSeatsBasedPricing";
DROP TABLE IF EXISTS public."CoveragePercentageBasedPricing";
DROP TABLE IF EXISTS public."CoverageAllowablePeriod";
DROP TABLE IF EXISTS public."CompanyAgent";
DROP TABLE IF EXISTS public."Company";
DROP TABLE IF EXISTS public."CancellationHistory";
DROP TABLE IF EXISTS public."AuthorizedPaymentMethod";
DROP TABLE IF EXISTS public."ApprovalHistory";
DROP TABLE IF EXISTS public."ApplicationCoverage";
DROP TABLE IF EXISTS public."AgentValuePercentageTier";
DROP TABLE IF EXISTS public."AgentSeatsTierPricing";
DROP TABLE IF EXISTS public."AgentSeatsBasedPricing";
DROP TABLE IF EXISTS public."AgentPayableTransaction";
DROP TABLE IF EXISTS public."AgentNetrate";
DROP TABLE IF EXISTS public."AgentFlatTierPricing";
DROP TABLE IF EXISTS public."Agent";
DROP TABLE IF EXISTS public."Address";
DROP TYPE IF EXISTS public."UserStatus";
DROP TYPE IF EXISTS public."RecordStatus";
DROP TYPE IF EXISTS public."PolicyStatus";
DROP TYPE IF EXISTS public."PaymentRemittance";
DROP TYPE IF EXISTS public."PaymentMethod";
DROP TYPE IF EXISTS public."InsuredType";
DROP TYPE IF EXISTS public."InLeaseTaskType";
DROP TYPE IF EXISTS public."EndorsementStatus";
DROP TYPE IF EXISTS public."EndorsementRequestType";
DROP TYPE IF EXISTS public."EndorsementChangeType";
DROP TYPE IF EXISTS public."CustomerStatus";
DROP TYPE IF EXISTS public."CoveragePricingMode";
DROP TYPE IF EXISTS public."CancellationDecision";
DROP TYPE IF EXISTS public."ApprovalDecision";
DROP TYPE IF EXISTS public."ApplicationStatus";
DROP TYPE IF EXISTS public."ApplicationPolicyType";
DROP TYPE IF EXISTS public."ApplicationChangeType";
DROP TYPE IF EXISTS public."AgentType";
DROP TYPE IF EXISTS public."AgentPayableTransactionType";
DROP TYPE IF EXISTS public."AddressType";
DROP TYPE IF EXISTS public."AddressRole";
--
-- Name: AddressRole; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."AddressRole" AS ENUM (
    'RISK',
    'INSURED'
);


ALTER TYPE public."AddressRole" OWNER TO policyapp;

--
-- Name: AddressType; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."AddressType" AS ENUM (
    'RESIDENTIAL',
    'OFFICE',
    'WAREHOUSE',
    'BRANCH',
    'RISK_LOCATION'
);


ALTER TYPE public."AddressType" OWNER TO policyapp;

--
-- Name: AgentPayableTransactionType; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."AgentPayableTransactionType" AS ENUM (
    'ISSUANCE',
    'ENDORSEMENT',
    'CANCELLED_POLICY',
    'PAYMENT'
);


ALTER TYPE public."AgentPayableTransactionType" OWNER TO policyapp;

--
-- Name: AgentType; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."AgentType" AS ENUM (
    'INDIVIDUAL',
    'CORPORATE'
);


ALTER TYPE public."AgentType" OWNER TO policyapp;

--
-- Name: ApplicationChangeType; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."ApplicationChangeType" AS ENUM (
    'INSURED_FROM_DATE',
    'INSURED_NAME_DETAILS',
    'INSURED_ADDRESS_DETAILS',
    'VEHICLE_MODEL',
    'VEHICLE_MV_FILE',
    'VEHICLE_PLATE_NO',
    'VEHICLE_TYPE',
    'VEHICLE_MAKE',
    'VEHICLE_COLOR',
    'VEHICLE_ENGINE_NO',
    'VEHICLE_CHASSIS_NO',
    'ADD_CLAUSE',
    'REMOVE_CLAUSE'
);


ALTER TYPE public."ApplicationChangeType" OWNER TO policyapp;

--
-- Name: ApplicationPolicyType; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."ApplicationPolicyType" AS ENUM (
    'NEW_POLICY',
    'RENEWAL'
);


ALTER TYPE public."ApplicationPolicyType" OWNER TO policyapp;

--
-- Name: ApplicationStatus; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."ApplicationStatus" AS ENUM (
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public."ApplicationStatus" OWNER TO policyapp;

--
-- Name: ApprovalDecision; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."ApprovalDecision" AS ENUM (
    'APPROVED',
    'REJECTED',
    'RETURNED_FOR_EDIT'
);


ALTER TYPE public."ApprovalDecision" OWNER TO policyapp;

--
-- Name: CancellationDecision; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."CancellationDecision" AS ENUM (
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public."CancellationDecision" OWNER TO policyapp;

--
-- Name: CoveragePricingMode; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."CoveragePricingMode" AS ENUM (
    'PERCENTAGE',
    'VALUE_PERCENTAGE',
    'FLAT_TIER',
    'VEHICLE_SEATS_BASED'
);


ALTER TYPE public."CoveragePricingMode" OWNER TO policyapp;

--
-- Name: CustomerStatus; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."CustomerStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'BLACKLISTED'
);


ALTER TYPE public."CustomerStatus" OWNER TO policyapp;

--
-- Name: EndorsementChangeType; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."EndorsementChangeType" AS ENUM (
    'POLICY_EFFECTIVE_DATE',
    'INSURED_NAME_DETAILS',
    'INSURED_ADDRESS_DETAILS',
    'VEHICLE_MODEL',
    'VEHICLE_MV_FILE',
    'VEHICLE_PLATE_NO',
    'VEHICLE_TYPE',
    'VEHICLE_MAKE',
    'VEHICLE_COLOR',
    'VEHICLE_ENGINE_NO',
    'VEHICLE_CHASSIS_NO',
    'EDIT_CLAUSE',
    'REMOVE_CLAUSE',
    'ADD_COVERAGE',
    'CANCEL_POLICY',
    'VEHICLE_ESTIMATED_VALUE'
);


ALTER TYPE public."EndorsementChangeType" OWNER TO policyapp;

--
-- Name: EndorsementRequestType; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."EndorsementRequestType" AS ENUM (
    'CORRECTION',
    'CANCELLATION'
);


ALTER TYPE public."EndorsementRequestType" OWNER TO policyapp;

--
-- Name: EndorsementStatus; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."EndorsementStatus" AS ENUM (
    'SUBMITTED',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public."EndorsementStatus" OWNER TO policyapp;

--
-- Name: InLeaseTaskType; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."InLeaseTaskType" AS ENUM (
    'FOR_UPLOAD',
    'FOR_ENDORSEMENT'
);


ALTER TYPE public."InLeaseTaskType" OWNER TO policyapp;

--
-- Name: InsuredType; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."InsuredType" AS ENUM (
    'INDIVIDUAL',
    'CORPORATE'
);


ALTER TYPE public."InsuredType" OWNER TO policyapp;

--
-- Name: PaymentMethod; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."PaymentMethod" AS ENUM (
    'CASH',
    'CHECK',
    'CREDIT_CARD',
    'BANK_TRANSFER',
    'ONLINE_PAYMENT'
);


ALTER TYPE public."PaymentMethod" OWNER TO policyapp;

--
-- Name: PaymentRemittance; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."PaymentRemittance" AS ENUM (
    'DIRECT_TO_BETHEL',
    'THROUGH_AGENT'
);


ALTER TYPE public."PaymentRemittance" OWNER TO policyapp;

--
-- Name: PolicyStatus; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."PolicyStatus" AS ENUM (
    'ACTIVE',
    'EXPIRED',
    'CANCELLED',
    'LAPSED'
);


ALTER TYPE public."PolicyStatus" OWNER TO policyapp;

--
-- Name: RecordStatus; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."RecordStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


ALTER TYPE public."RecordStatus" OWNER TO policyapp;

--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: policyapp
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED',
    'AWAITING_EMAIL_VERIFICATION'
);


ALTER TYPE public."UserStatus" OWNER TO policyapp;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Address; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."Address" (
    id uuid NOT NULL,
    address_line_1 character varying(255) NOT NULL,
    address_line_2 character varying(255),
    barangay character varying(100),
    city character varying(100),
    province character varying(100),
    postal_code character varying(20),
    country character varying(100),
    latitude numeric(10,7),
    longitude numeric(10,7),
    google_place_id character varying(255),
    formatted_address text,
    address_type public."AddressType" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    estimated_value numeric(18,2)
);


ALTER TABLE public."Address" OWNER TO policyapp;

--
-- Name: Agent; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."Agent" (
    id uuid NOT NULL,
    agent_code character varying(50) NOT NULL,
    agent_name character varying(255) NOT NULL,
    work_email character varying(255) NOT NULL,
    status public."RecordStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    agent_type public."AgentType" DEFAULT 'INDIVIDUAL'::public."AgentType" NOT NULL,
    company_id uuid,
    linked_company_id uuid,
    payable numeric(18,2) DEFAULT 0 NOT NULL,
    payment_terms_days integer DEFAULT 30 NOT NULL
);


ALTER TABLE public."Agent" OWNER TO policyapp;

--
-- Name: AgentFlatTierPricing; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."AgentFlatTierPricing" (
    id uuid NOT NULL,
    agent_id uuid NOT NULL,
    coverage_amount numeric(18,2) NOT NULL,
    coverage_price numeric(18,2) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    coverage_allowable_period_id uuid NOT NULL
);


ALTER TABLE public."AgentFlatTierPricing" OWNER TO policyapp;

--
-- Name: AgentNetrate; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."AgentNetrate" (
    id uuid NOT NULL,
    agent_id uuid NOT NULL,
    netrate numeric(10,6) NOT NULL,
    maximum_coverage numeric(18,2),
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    coverage_allowable_period_id uuid NOT NULL
);


ALTER TABLE public."AgentNetrate" OWNER TO policyapp;

--
-- Name: AgentPayableTransaction; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."AgentPayableTransaction" (
    id uuid NOT NULL,
    agent_id uuid NOT NULL,
    transaction_type public."AgentPayableTransactionType" NOT NULL,
    amount numeric(18,2) NOT NULL,
    policy_id uuid,
    endorsement_request_id uuid,
    remarks text,
    created_by_user_id uuid,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    applies_to_transaction_id uuid,
    due_date timestamp(3) without time zone,
    remaining_amount numeric(18,2),
    CONSTRAINT "AgentPayableTransaction_amount_sign_check" CHECK ((((transaction_type = 'ISSUANCE'::public."AgentPayableTransactionType") AND (amount >= (0)::numeric)) OR (transaction_type = 'ENDORSEMENT'::public."AgentPayableTransactionType") OR ((transaction_type = ANY (ARRAY['CANCELLED_POLICY'::public."AgentPayableTransactionType", 'PAYMENT'::public."AgentPayableTransactionType"])) AND (amount <= (0)::numeric))))
);


ALTER TABLE public."AgentPayableTransaction" OWNER TO policyapp;

--
-- Name: AgentSeatsBasedPricing; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."AgentSeatsBasedPricing" (
    id uuid NOT NULL,
    agent_id uuid NOT NULL,
    coverage_allowable_period_id uuid NOT NULL,
    threshold_amount numeric(18,2) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    exceed_threshold_amount numeric(18,2) NOT NULL,
    exceed_threshold_price numeric(10,2) NOT NULL
);


ALTER TABLE public."AgentSeatsBasedPricing" OWNER TO policyapp;

--
-- Name: AgentSeatsTierPricing; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."AgentSeatsTierPricing" (
    id uuid NOT NULL,
    agent_id uuid NOT NULL,
    coverage_allowable_period_id uuid NOT NULL,
    insured_amount_per_occupant numeric(18,2) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AgentSeatsTierPricing" OWNER TO policyapp;

--
-- Name: AgentValuePercentageTier; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."AgentValuePercentageTier" (
    id uuid NOT NULL,
    agent_id uuid NOT NULL,
    min_value numeric(18,2) NOT NULL,
    rate_percentage numeric(7,4) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    coverage_allowable_period_id uuid NOT NULL
);


ALTER TABLE public."AgentValuePercentageTier" OWNER TO policyapp;

--
-- Name: ApplicationCoverage; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."ApplicationCoverage" (
    id uuid NOT NULL,
    application_id uuid NOT NULL,
    coverage_id uuid NOT NULL,
    coverage_amount numeric(18,2) NOT NULL,
    premium_amount numeric(18,2) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    applied_rate numeric(10,6) NOT NULL,
    payable_to_bethel numeric(18,2) NOT NULL,
    policy_application_vehicle_id uuid
);


ALTER TABLE public."ApplicationCoverage" OWNER TO policyapp;

--
-- Name: ApprovalHistory; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."ApprovalHistory" (
    id uuid NOT NULL,
    application_id uuid NOT NULL,
    approver_id uuid NOT NULL,
    decision public."ApprovalDecision" NOT NULL,
    comments text,
    decision_date timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ApprovalHistory" OWNER TO policyapp;

--
-- Name: AuthorizedPaymentMethod; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."AuthorizedPaymentMethod" (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AuthorizedPaymentMethod" OWNER TO policyapp;

--
-- Name: CancellationHistory; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."CancellationHistory" (
    id uuid NOT NULL,
    policy_id uuid NOT NULL,
    approver_id uuid NOT NULL,
    decision public."CancellationDecision" NOT NULL,
    comments text,
    decision_date timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."CancellationHistory" OWNER TO policyapp;

--
-- Name: Company; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."Company" (
    id uuid NOT NULL,
    company_code character varying(50) NOT NULL,
    company_name character varying(255) NOT NULL,
    tin_no character varying(100),
    email character varying(255) NOT NULL,
    status public."RecordStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Company" OWNER TO policyapp;

--
-- Name: CompanyAgent; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."CompanyAgent" (
    id uuid NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."CompanyAgent" OWNER TO policyapp;

--
-- Name: CoverageAllowablePeriod; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."CoverageAllowablePeriod" (
    id uuid NOT NULL,
    coverage_id uuid NOT NULL,
    coverage_in_days integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."CoverageAllowablePeriod" OWNER TO policyapp;

--
-- Name: CoveragePercentageBasedPricing; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."CoveragePercentageBasedPricing" (
    id uuid NOT NULL,
    standard_rate numeric(10,6) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    coverage_allowable_period_id uuid NOT NULL
);


ALTER TABLE public."CoveragePercentageBasedPricing" OWNER TO policyapp;

--
-- Name: CoverageSeatsBasedPricing; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."CoverageSeatsBasedPricing" (
    id uuid NOT NULL,
    coverage_allowable_period_id uuid NOT NULL,
    threshold_amount numeric(18,2) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    exceed_threshold_amount numeric(18,2) NOT NULL,
    exceed_threshold_price numeric(10,2) NOT NULL
);


ALTER TABLE public."CoverageSeatsBasedPricing" OWNER TO policyapp;

--
-- Name: CoverageSeatsTierPricing; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."CoverageSeatsTierPricing" (
    id uuid NOT NULL,
    coverage_allowable_period_id uuid NOT NULL,
    insured_amount_per_occupant numeric(18,2) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."CoverageSeatsTierPricing" OWNER TO policyapp;

--
-- Name: CoverageTierBasedPricing; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."CoverageTierBasedPricing" (
    id uuid NOT NULL,
    coverage_amount numeric(18,2) NOT NULL,
    coverage_price numeric(18,2) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    coverage_allowable_period_id uuid NOT NULL
);


ALTER TABLE public."CoverageTierBasedPricing" OWNER TO policyapp;

--
-- Name: CoverageValuePercentageTier; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."CoverageValuePercentageTier" (
    id uuid NOT NULL,
    min_value numeric(18,2) NOT NULL,
    rate_percentage numeric(7,4) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    coverage_allowable_period_id uuid NOT NULL
);


ALTER TABLE public."CoverageValuePercentageTier" OWNER TO policyapp;

--
-- Name: Customer; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."Customer" (
    id uuid NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    middle_name character varying(100),
    birthday date,
    gender character varying(20),
    email character varying(255) NOT NULL,
    mobile_number character varying(50),
    company_id uuid,
    status public."CustomerStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Customer" OWNER TO policyapp;

--
-- Name: CustomerAgent; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."CustomerAgent" (
    id uuid NOT NULL,
    customer_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."CustomerAgent" OWNER TO policyapp;

--
-- Name: EndorsementApprovalHistory; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."EndorsementApprovalHistory" (
    id uuid NOT NULL,
    endorsement_request_id uuid NOT NULL,
    approver_id uuid NOT NULL,
    decision public."ApprovalDecision" NOT NULL,
    comments text,
    decision_date timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."EndorsementApprovalHistory" OWNER TO policyapp;

--
-- Name: EndorsementChange; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."EndorsementChange" (
    id uuid NOT NULL,
    endorsement_request_id uuid NOT NULL,
    policy_vehicle_id uuid,
    policy_coverage_id uuid,
    change_type public."EndorsementChangeType" NOT NULL,
    change_from text,
    change_to text,
    remarks text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    product_coverage_id uuid,
    coverage_amount numeric(18,2),
    premium_amount numeric(18,2),
    payable_to_bethel numeric(18,2),
    applied_rate numeric(10,6),
    is_misc boolean,
    created_policy_coverage_id uuid
);


ALTER TABLE public."EndorsementChange" OWNER TO policyapp;

--
-- Name: EndorsementRequest; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."EndorsementRequest" (
    id uuid NOT NULL,
    policy_id uuid NOT NULL,
    endorsement_number character varying(60) NOT NULL,
    sequence_no integer NOT NULL,
    status public."EndorsementStatus" DEFAULT 'SUBMITTED'::public."EndorsementStatus" NOT NULL,
    effective_date date NOT NULL,
    remarks text,
    send_policy_to_email boolean DEFAULT false NOT NULL,
    send_policy_to_email_on_approval boolean DEFAULT false NOT NULL,
    created_by_agent_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    request_type public."EndorsementRequestType" DEFAULT 'CORRECTION'::public."EndorsementRequestType" NOT NULL
);


ALTER TABLE public."EndorsementRequest" OWNER TO policyapp;

--
-- Name: InLeaseBacklog; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."InLeaseBacklog" (
    id uuid NOT NULL,
    policy_id uuid NOT NULL,
    type public."InLeaseTaskType" NOT NULL,
    accomplished_by_user_id uuid,
    accomplished_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    endorsement_request_id uuid
);


ALTER TABLE public."InLeaseBacklog" OWNER TO policyapp;

--
-- Name: InsuranceClass; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."InsuranceClass" (
    id uuid NOT NULL,
    class_name character varying(100) NOT NULL,
    description text,
    status public."RecordStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."InsuranceClass" OWNER TO policyapp;

--
-- Name: PartyAddress; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PartyAddress" (
    id uuid NOT NULL,
    customer_id uuid,
    company_id uuid,
    address_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "PartyAddress_exactly_one_party" CHECK ((((customer_id IS NOT NULL) AND (company_id IS NULL)) OR ((customer_id IS NULL) AND (company_id IS NOT NULL))))
);


ALTER TABLE public."PartyAddress" OWNER TO policyapp;

--
-- Name: PartyVehicle; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PartyVehicle" (
    id uuid NOT NULL,
    customer_id uuid,
    company_id uuid,
    vehicle_id uuid NOT NULL,
    ownership_start_date date,
    ownership_end_date date,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "PartyVehicle_exactly_one_party" CHECK ((((customer_id IS NOT NULL) AND (company_id IS NULL)) OR ((customer_id IS NULL) AND (company_id IS NOT NULL))))
);


ALTER TABLE public."PartyVehicle" OWNER TO policyapp;

--
-- Name: Permission; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."Permission" (
    id uuid NOT NULL,
    permission_code character varying(100) NOT NULL,
    permission_name character varying(255) NOT NULL,
    description text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Permission" OWNER TO policyapp;

--
-- Name: Policy; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."Policy" (
    id uuid NOT NULL,
    policy_number character varying(50) NOT NULL,
    application_id uuid NOT NULL,
    customer_id uuid,
    company_id uuid,
    agent_id uuid NOT NULL,
    agent_name_snapshot character varying(255),
    product_variant_id uuid NOT NULL,
    issue_date date NOT NULL,
    effective_date date NOT NULL,
    expiry_date date NOT NULL,
    policy_status public."PolicyStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    company_name_snapshot character varying(255),
    customer_name_snapshot character varying(255),
    agent_code_snapshot character varying(50),
    class_name_snapshot character varying(100) NOT NULL,
    deductible_rate_snapshot numeric(7,4),
    doc_stamps numeric(18,2) NOT NULL,
    lgt numeric(18,2) NOT NULL,
    misc numeric(18,2) NOT NULL,
    remarks text,
    total_premium numeric(18,2) NOT NULL,
    variant_name_snapshot character varying(255) NOT NULL,
    vat numeric(18,2) NOT NULL,
    coc_number character varying(50),
    sa_number character varying(50),
    renewed_policy_number_snapshot character varying(50),
    cancelled_at date,
    minimum_deductible_amount_snapshot numeric(18,2)
);


ALTER TABLE public."Policy" OWNER TO policyapp;

--
-- Name: PolicyAddress; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PolicyAddress" (
    id uuid NOT NULL,
    policy_id uuid NOT NULL,
    address_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role public."AddressRole" NOT NULL,
    formatted_address_snapshot text NOT NULL
);


ALTER TABLE public."PolicyAddress" OWNER TO policyapp;

--
-- Name: PolicyApplication; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PolicyApplication" (
    id uuid NOT NULL,
    insured_type public."InsuredType" NOT NULL,
    application_number character varying(50) NOT NULL,
    customer_id uuid,
    company_id uuid,
    company_name_snapshot character varying(255),
    agent_id uuid NOT NULL,
    agent_name_snapshot character varying(255),
    product_variant_id uuid NOT NULL,
    application_date date NOT NULL,
    submission_date date NOT NULL,
    status public."ApplicationStatus" NOT NULL,
    remarks text,
    document_folder_name character varying(255),
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    coverage_start_at timestamp(3) without time zone NOT NULL,
    coverage_end_at timestamp(3) without time zone NOT NULL,
    total_premium numeric(18,2) NOT NULL,
    doc_stamps numeric(18,2) NOT NULL,
    vat numeric(18,2) NOT NULL,
    lgt numeric(18,2) NOT NULL,
    misc numeric(18,2) NOT NULL,
    send_policy_to_email boolean DEFAULT false NOT NULL,
    payment_method public."PaymentMethod" NOT NULL,
    payment_remittance public."PaymentRemittance" NOT NULL,
    bethel_payment_method_id uuid,
    source_quotation_id uuid,
    send_policy_to_email_on_approval boolean DEFAULT false NOT NULL,
    policy_type public."ApplicationPolicyType" DEFAULT 'NEW_POLICY'::public."ApplicationPolicyType" NOT NULL,
    renewed_policy_id uuid
);


ALTER TABLE public."PolicyApplication" OWNER TO policyapp;

--
-- Name: PolicyApplicationAddress; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PolicyApplicationAddress" (
    id uuid NOT NULL,
    policy_application_id uuid NOT NULL,
    address_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role public."AddressRole" NOT NULL
);


ALTER TABLE public."PolicyApplicationAddress" OWNER TO policyapp;

--
-- Name: PolicyApplicationChange; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PolicyApplicationChange" (
    id uuid NOT NULL,
    policy_application_id uuid NOT NULL,
    application_vehicle_id uuid,
    application_coverage_id uuid,
    change_type public."ApplicationChangeType" NOT NULL,
    change_from text,
    change_to text,
    effective_date date,
    remarks text,
    created_by_user_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."PolicyApplicationChange" OWNER TO policyapp;

--
-- Name: PolicyApplicationVehicle; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PolicyApplicationVehicle" (
    id uuid NOT NULL,
    policy_application_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."PolicyApplicationVehicle" OWNER TO policyapp;

--
-- Name: PolicyCoverage; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PolicyCoverage" (
    id uuid NOT NULL,
    policy_id uuid NOT NULL,
    coverage_id uuid NOT NULL,
    coverage_amount numeric(18,2) NOT NULL,
    premium_amount numeric(18,2) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    clause_snapshot text NOT NULL,
    coverage_code_snapshot character varying(50) NOT NULL,
    coverage_name_snapshot character varying(255) NOT NULL,
    pricing_mode_snapshot public."CoveragePricingMode" NOT NULL,
    payable_to_bethel numeric(18,2),
    applied_rate numeric(10,6),
    is_misc_snapshot boolean DEFAULT false NOT NULL,
    policy_vehicle_id uuid,
    added_by_endorsement_id uuid,
    removed_at timestamp(3) without time zone,
    removed_by_endorsement_id uuid
);


ALTER TABLE public."PolicyCoverage" OWNER TO policyapp;

--
-- Name: PolicyQuotation; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PolicyQuotation" (
    id uuid NOT NULL,
    insured_type public."InsuredType" NOT NULL,
    quotation_number character varying(50) NOT NULL,
    customer_id uuid,
    company_id uuid,
    company_name_snapshot character varying(255),
    agent_id uuid NOT NULL,
    agent_name_snapshot character varying(255),
    product_variant_id uuid NOT NULL,
    coverage_start_at timestamp(3) without time zone NOT NULL,
    coverage_end_at timestamp(3) without time zone NOT NULL,
    quotation_date date NOT NULL,
    total_premium numeric(18,2) NOT NULL,
    doc_stamps numeric(18,2) NOT NULL,
    vat numeric(18,2) NOT NULL,
    lgt numeric(18,2) NOT NULL,
    misc numeric(18,2) NOT NULL,
    send_policy_to_email boolean DEFAULT false NOT NULL,
    remarks text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    renewed_policy_id uuid
);


ALTER TABLE public."PolicyQuotation" OWNER TO policyapp;

--
-- Name: PolicyQuotationAddress; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PolicyQuotationAddress" (
    id uuid NOT NULL,
    policy_quotation_id uuid NOT NULL,
    address_id uuid NOT NULL,
    role public."AddressRole" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."PolicyQuotationAddress" OWNER TO policyapp;

--
-- Name: PolicyQuotationVehicle; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PolicyQuotationVehicle" (
    id uuid NOT NULL,
    policy_quotation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."PolicyQuotationVehicle" OWNER TO policyapp;

--
-- Name: PolicyVehicle; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."PolicyVehicle" (
    id uuid NOT NULL,
    policy_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    chassis_number_snapshot character varying(100) NOT NULL,
    color_snapshot character varying(50),
    engine_number_snapshot character varying(100),
    make_snapshot character varying(100),
    model_snapshot character varying(100),
    mv_file_no_snapshot character varying(100) NOT NULL,
    no_of_seats_snapshot integer NOT NULL,
    plate_number_snapshot character varying(50),
    vehicle_type_snapshot character varying(50),
    year_model_snapshot integer
);


ALTER TABLE public."PolicyVehicle" OWNER TO policyapp;

--
-- Name: ProductCoverage; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."ProductCoverage" (
    id uuid NOT NULL,
    product_variant_id uuid NOT NULL,
    coverage_code character varying(50) NOT NULL,
    coverage_name character varying(255) NOT NULL,
    maximum_coverage numeric(18,2) NOT NULL,
    status public."RecordStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    clause text NOT NULL,
    pricing_mode public."CoveragePricingMode" DEFAULT 'PERCENTAGE'::public."CoveragePricingMode" NOT NULL,
    is_misc boolean DEFAULT false NOT NULL
);


ALTER TABLE public."ProductCoverage" OWNER TO policyapp;

--
-- Name: ProductVariant; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."ProductVariant" (
    id uuid NOT NULL,
    insurance_class_id uuid NOT NULL,
    variant_code character varying(50) NOT NULL,
    variant_name character varying(255) NOT NULL,
    description text,
    status public."RecordStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deductible_rate numeric(7,4),
    misc_fee numeric(18,2),
    gross_target_coverage_id uuid,
    minimum_deductible_amount numeric(18,2)
);


ALTER TABLE public."ProductVariant" OWNER TO policyapp;

--
-- Name: QuotationCoverage; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."QuotationCoverage" (
    id uuid NOT NULL,
    quotation_id uuid NOT NULL,
    coverage_id uuid NOT NULL,
    policy_quotation_vehicle_id uuid,
    coverage_amount numeric(18,2) NOT NULL,
    premium_amount numeric(18,2) NOT NULL,
    payable_to_bethel numeric(18,2) NOT NULL,
    applied_rate numeric(10,6) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."QuotationCoverage" OWNER TO policyapp;

--
-- Name: Role; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."Role" (
    id uuid NOT NULL,
    role_name character varying(50) NOT NULL,
    description text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Role" OWNER TO policyapp;

--
-- Name: RolePermission; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."RolePermission" (
    id uuid NOT NULL,
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."RolePermission" OWNER TO policyapp;

--
-- Name: User; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."User" (
    id uuid NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255),
    full_name character varying(255) NOT NULL,
    status public."UserStatus" NOT NULL,
    agent_id uuid,
    customer_id uuid,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    email_verified_at timestamp(3) without time zone,
    invite_token character varying(255),
    invite_token_expires_at timestamp(3) without time zone
);


ALTER TABLE public."User" OWNER TO policyapp;

--
-- Name: UserPermission; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."UserPermission" (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."UserPermission" OWNER TO policyapp;

--
-- Name: UserRole; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."UserRole" (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."UserRole" OWNER TO policyapp;

--
-- Name: Vehicle; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public."Vehicle" (
    id uuid NOT NULL,
    plate_number character varying(50),
    engine_number character varying(100),
    chassis_number character varying(100) NOT NULL,
    make character varying(100),
    model character varying(100),
    year_model integer,
    vehicle_type character varying(50),
    color character varying(50),
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    mv_file_no character varying(100) NOT NULL,
    estimated_value numeric(18,2),
    initial_assessment_date date,
    no_of_seats integer DEFAULT 5 NOT NULL,
    product_variant_id uuid
);


ALTER TABLE public."Vehicle" OWNER TO policyapp;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: policyapp
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO policyapp;

--
-- Data for Name: Address; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."Address" (id, address_line_1, address_line_2, barangay, city, province, postal_code, country, latitude, longitude, google_place_id, formatted_address, address_type, created_at, updated_at, estimated_value) FROM stdin;
\.


--
-- Data for Name: Agent; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."Agent" (id, agent_code, agent_name, work_email, status, created_at, updated_at, agent_type, company_id, linked_company_id, payable, payment_terms_days) FROM stdin;
f3c382ae-fb35-49b2-9076-3dd56e20ca48	BETHL-MRKNA	Bethel Life and General Insurance (Marikina)	jcdnavarro@bethelgen.com	ACTIVE	2026-09-18 01:20:06.225	2026-09-18 07:01:11.238	CORPORATE	\N	4ddd49f0-2fd4-410f-a648-fb16d883f920	0.00	0
\.


--
-- Data for Name: AgentFlatTierPricing; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."AgentFlatTierPricing" (id, agent_id, coverage_amount, coverage_price, created_at, coverage_allowable_period_id) FROM stdin;
\.


--
-- Data for Name: AgentNetrate; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."AgentNetrate" (id, agent_id, netrate, maximum_coverage, created_at, updated_at, coverage_allowable_period_id) FROM stdin;
\.


--
-- Data for Name: AgentPayableTransaction; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."AgentPayableTransaction" (id, agent_id, transaction_type, amount, policy_id, endorsement_request_id, remarks, created_by_user_id, created_at, applies_to_transaction_id, due_date, remaining_amount) FROM stdin;
\.


--
-- Data for Name: AgentSeatsBasedPricing; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."AgentSeatsBasedPricing" (id, agent_id, coverage_allowable_period_id, threshold_amount, created_at, updated_at, exceed_threshold_amount, exceed_threshold_price) FROM stdin;
\.


--
-- Data for Name: AgentSeatsTierPricing; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."AgentSeatsTierPricing" (id, agent_id, coverage_allowable_period_id, insured_amount_per_occupant, created_at) FROM stdin;
\.


--
-- Data for Name: AgentValuePercentageTier; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."AgentValuePercentageTier" (id, agent_id, min_value, rate_percentage, created_at, coverage_allowable_period_id) FROM stdin;
ba33dfe5-badb-4d63-9d40-812da7782699	f3c382ae-fb35-49b2-9076-3dd56e20ca48	0.00	1.0700	2026-09-18 04:51:01.992	aa3bf5b0-0ef8-475c-a2aa-d1fdf3272fb7
76e1c8de-07b7-40a9-a56c-5e07df6c127b	f3c382ae-fb35-49b2-9076-3dd56e20ca48	0.00	0.3500	2026-09-18 05:03:00.879	ab2a866f-e011-4d72-bd3f-089032641e9f
\.


--
-- Data for Name: ApplicationCoverage; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."ApplicationCoverage" (id, application_id, coverage_id, coverage_amount, premium_amount, created_at, updated_at, applied_rate, payable_to_bethel, policy_application_vehicle_id) FROM stdin;
\.


--
-- Data for Name: ApprovalHistory; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."ApprovalHistory" (id, application_id, approver_id, decision, comments, decision_date, created_at) FROM stdin;
\.


--
-- Data for Name: AuthorizedPaymentMethod; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."AuthorizedPaymentMethod" (id, name, created_at) FROM stdin;
130838e4-3643-4397-9c3b-874e3584816a	Bank Deposit — BDO	2026-09-03 22:20:23.402
bc2b8569-3d62-40ee-b03c-e161e14804e5	Bank Deposit — BPI	2026-09-03 22:20:23.407
9964e1db-e9c4-4622-bb6d-4d17d5866238	GCash	2026-09-03 22:20:23.41
bd2cf1cf-780d-4029-8c3f-d1a224510944	Maya	2026-09-03 22:20:23.414
575c9f58-1169-4595-970d-7c27ae594488	Over-the-Counter	2026-09-03 22:20:23.417
\.


--
-- Data for Name: CancellationHistory; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."CancellationHistory" (id, policy_id, approver_id, decision, comments, decision_date, created_at) FROM stdin;
\.


--
-- Data for Name: Company; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."Company" (id, company_code, company_name, tin_no, email, status, created_at, updated_at) FROM stdin;
4ddd49f0-2fd4-410f-a648-fb16d883f920	BETHL-MRKNA	Bethel Life and General Insurance (Marikina)	\N	jcdnavarro@bethelgen.com	ACTIVE	2026-09-18 01:20:06.221	2026-09-18 01:20:06.221
\.


--
-- Data for Name: CompanyAgent; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."CompanyAgent" (id, company_id, agent_id, created_at) FROM stdin;
b78e4a7c-052f-414e-886d-83bfd611150f	4ddd49f0-2fd4-410f-a648-fb16d883f920	f3c382ae-fb35-49b2-9076-3dd56e20ca48	2026-09-18 01:20:06.228
\.


--
-- Data for Name: CoverageAllowablePeriod; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."CoverageAllowablePeriod" (id, coverage_id, coverage_in_days, created_at) FROM stdin;
8edaa552-ade9-4b4a-b6d7-c9e83054df38	0d79c8d1-c10b-448d-8a98-e135a8b9ea87	365	2026-09-12 05:07:57.854
ab2a866f-e011-4d72-bd3f-089032641e9f	cad84277-605a-4fa6-afb5-c65b138d0aaf	365	2026-09-12 05:07:57.87
aa3bf5b0-0ef8-475c-a2aa-d1fdf3272fb7	1e966b25-61ef-4a63-9652-d7d1dd64b013	365	2026-09-12 05:07:57.887
7f960540-d83d-437c-a7d2-878698722265	4fc358ff-fb46-4923-b1b7-dfd34e759f92	365	2026-09-17 20:00:39.43
f9ae3faa-bef5-4131-a9f1-6af96b056c58	67c89b3f-f1c7-42d3-bf3c-f8ee6a320f2a	365	2026-09-17 20:03:22.795
\.


--
-- Data for Name: CoveragePercentageBasedPricing; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."CoveragePercentageBasedPricing" (id, standard_rate, created_at, updated_at, coverage_allowable_period_id) FROM stdin;
0c58ecaa-b04d-4183-bf65-dd970c5229c1	0.002500	2026-09-15 20:50:45.637	2026-09-17 19:18:32.118	8edaa552-ade9-4b4a-b6d7-c9e83054df38
aebf8321-c8b3-4351-9a30-0dce1bc8f7b9	0.008000	2026-09-15 20:50:45.653	2026-09-17 19:18:32.13	ab2a866f-e011-4d72-bd3f-089032641e9f
2856e0f4-7908-4f17-9698-2c2948568dd4	0.030000	2026-09-15 20:50:45.661	2026-09-17 19:18:32.139	aa3bf5b0-0ef8-475c-a2aa-d1fdf3272fb7
\.


--
-- Data for Name: CoverageSeatsBasedPricing; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."CoverageSeatsBasedPricing" (id, coverage_allowable_period_id, threshold_amount, created_at, updated_at, exceed_threshold_amount, exceed_threshold_price) FROM stdin;
a1a46ee3-b6f9-463c-849a-5252981ba2f5	8edaa552-ade9-4b4a-b6d7-c9e83054df38	350000.00	2026-09-17 19:58:16.751	2026-09-17 19:58:16.751	50000.00	50.00
\.


--
-- Data for Name: CoverageSeatsTierPricing; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."CoverageSeatsTierPricing" (id, coverage_allowable_period_id, insured_amount_per_occupant, created_at) FROM stdin;
c7c9c1ba-5b8c-4ba8-b8c7-f284ad27f2f5	8edaa552-ade9-4b4a-b6d7-c9e83054df38	50000.00	2026-09-17 19:58:16.733
02ef778d-04d8-484a-bf99-ce48ab5a2caf	8edaa552-ade9-4b4a-b6d7-c9e83054df38	100000.00	2026-09-17 19:58:16.733
1a794840-7567-424b-9947-c97f7b12ceed	8edaa552-ade9-4b4a-b6d7-c9e83054df38	150000.00	2026-09-17 19:58:16.733
\.


--
-- Data for Name: CoverageTierBasedPricing; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."CoverageTierBasedPricing" (id, coverage_amount, coverage_price, created_at, coverage_allowable_period_id) FROM stdin;
54db2b52-3729-4518-9827-ed85689b7a74	50000.00	975.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
241fdf06-75bf-46da-b6e8-6a3cc33901d2	75000.00	1035.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
32198c26-3ba4-4a17-ab7a-5b6843f82253	100000.00	1095.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
fc9dfe62-1c3e-4745-869f-4ebeb70c26dc	150000.00	1170.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
da30ac89-e414-41ae-a0a0-7e7b60a700b1	200000.00	1245.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
9cf6b2bb-9a9f-4593-9ed3-9abe19d4ea78	250000.00	1320.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
1904ca7b-670c-43ec-9d97-6447ec1a4929	300000.00	1395.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
f634a15e-5ee4-4c74-81c5-0247ef1a46bd	400000.00	1515.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
77fe9360-9f98-4fa2-8ce3-ab015d47b171	500000.00	1635.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
9c5665b0-8bb3-4753-a5ec-881959f87e9a	750000.00	1920.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
02605756-ddc4-4530-aab8-a5643b7c08da	1000000.00	2235.00	2026-09-17 20:02:33.541	7f960540-d83d-437c-a7d2-878698722265
07991db3-f432-456d-a289-97c2083838c4	50000.00	195.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
415320d3-de50-4c7e-8ae0-5aa5e67fd7af	75000.00	225.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
d01361ea-5908-44b9-9695-f6379db883a6	100000.00	270.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
47dadef1-bb0d-4552-ba8d-cd8995610ed1	150000.00	345.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
806e394f-05ea-4433-8d96-bc8589d04bd7	200000.00	420.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
4dc9bdf2-3b15-44f4-8146-9a6310366398	250000.00	510.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
396dcc05-d49d-47cd-99de-377bde6ccb3a	300000.00	585.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
e69345a3-5115-457b-846f-07f83dc0876b	400000.00	675.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
b6996642-2f80-49e1-9df3-d25ab7915ecd	500000.00	780.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
2c7f8d57-2e2a-4193-a4f3-6ddf7878d4db	750000.00	915.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
764e1354-598d-4449-85f2-bb2659c6e8fa	1000000.00	1050.00	2026-09-17 20:04:41.703	f9ae3faa-bef5-4131-a9f1-6af96b056c58
\.


--
-- Data for Name: CoverageValuePercentageTier; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."CoverageValuePercentageTier" (id, min_value, rate_percentage, created_at, coverage_allowable_period_id) FROM stdin;
aafe0230-0926-425b-b131-366635fe4471	0.00	1.2000	2026-09-18 01:28:37.613	ab2a866f-e011-4d72-bd3f-089032641e9f
4709ddea-a295-49b1-a814-08f96591c8e2	0.00	3.0000	2026-09-18 01:28:58.841	aa3bf5b0-0ef8-475c-a2aa-d1fdf3272fb7
\.


--
-- Data for Name: Customer; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."Customer" (id, first_name, last_name, middle_name, birthday, gender, email, mobile_number, company_id, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: CustomerAgent; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."CustomerAgent" (id, customer_id, agent_id, created_at) FROM stdin;
\.


--
-- Data for Name: EndorsementApprovalHistory; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."EndorsementApprovalHistory" (id, endorsement_request_id, approver_id, decision, comments, decision_date, created_at) FROM stdin;
\.


--
-- Data for Name: EndorsementChange; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."EndorsementChange" (id, endorsement_request_id, policy_vehicle_id, policy_coverage_id, change_type, change_from, change_to, remarks, created_at, updated_at, product_coverage_id, coverage_amount, premium_amount, payable_to_bethel, applied_rate, is_misc, created_policy_coverage_id) FROM stdin;
\.


--
-- Data for Name: EndorsementRequest; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."EndorsementRequest" (id, policy_id, endorsement_number, sequence_no, status, effective_date, remarks, send_policy_to_email, send_policy_to_email_on_approval, created_by_agent_id, created_by_user_id, created_at, updated_at, request_type) FROM stdin;
\.


--
-- Data for Name: InLeaseBacklog; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."InLeaseBacklog" (id, policy_id, type, accomplished_by_user_id, accomplished_at, created_at, updated_at, endorsement_request_id) FROM stdin;
\.


--
-- Data for Name: InsuranceClass; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."InsuranceClass" (id, class_name, description, status, created_at, updated_at) FROM stdin;
a5500c82-af8a-4d9d-ab49-8788ba2cac20	Motor	Motor vehicle insurance	ACTIVE	2026-08-26 07:53:25.151	2026-08-26 07:53:25.151
f42aa308-1b8a-439f-9164-685f997bea2f	Property	Property insurance	ACTIVE	2026-08-26 08:13:02.804	2026-08-26 08:13:02.804
0ceb9689-adb5-49d5-a5c5-9f796d092dc9	Marine	Marine cargo and hull insurance	INACTIVE	2026-09-15 20:54:17.88	2026-09-15 20:55:06.595
\.


--
-- Data for Name: PartyAddress; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PartyAddress" (id, customer_id, company_id, address_id, is_primary, created_at) FROM stdin;
\.


--
-- Data for Name: PartyVehicle; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PartyVehicle" (id, customer_id, company_id, vehicle_id, ownership_start_date, ownership_end_date, created_at) FROM stdin;
\.


--
-- Data for Name: Permission; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."Permission" (id, permission_code, permission_name, description, created_at, updated_at) FROM stdin;
1fd11702-c0f2-4dd4-9961-091847e4d762	MANAGE_SETTINGS	Settings	Access system settings	2026-08-26 06:10:56.046	2026-09-17 19:18:31.812
e31073fa-fbb5-42b3-bfc0-d0d759dd7a59	MANAGE_SETTINGS.MANAGE_PRODUCTS	Manage Products	Access the Manage Products page	2026-09-15 20:50:45.34	2026-09-17 19:18:31.821
3ab5ad79-4e5c-4d3c-a9a2-38c7d20e159d	MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_CLASS	Add/Remove Insurance Classes	Create and remove insurance classes	2026-09-15 21:01:38.944	2026-09-17 19:18:31.823
981da83d-8cac-4047-ba19-bd291acface5	MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_VARIANT	Add/Remove Product Variants	Create and remove product variants	2026-09-15 21:01:38.948	2026-09-17 19:18:31.824
48d9bd5a-4456-4272-8905-017e9ec4006c	QUOTATION_TRACKER	Quotation Tracker	Access the Quotation Tracker page	2026-09-14 23:43:52.838	2026-09-17 19:18:31.83
ca4a8798-30f7-40dc-98f2-6de83da053d3	MANAGE_AGENTS	My Agents	Access the My Agents page	2026-08-26 06:10:56.03	2026-09-17 19:18:31.785
56c5bd5a-cb4f-4688-b152-311f3473be3e	MANAGE_AGENTS.VIEW_AGENT_PREMIUMS	View Premiums Generated	See how much in premiums each agent has generated, all-time and in the last 30 days	2026-09-03 20:26:01.085	2026-09-17 19:18:31.786
35f0577c-711f-4727-8410-6878bbe26924	MANAGE_AGENTS.MANAGE_AGENT_RATES	Manage Agent Rates	See each agent's special rates and edit them	2026-09-03 20:20:30.215	2026-09-17 19:18:31.788
e81c4da9-2500-4977-9cda-a4ca8084bf40	MANAGE_USERS	Manage Users	View the Manage Users page and user list	2026-08-18 14:43:33.846	2026-09-17 19:18:31.755
c7473228-8ba3-4615-8f7a-f913fec9b003	MANAGE_USERS.ADD_USER	Add User	Invite new user accounts	2026-08-26 06:10:56.02	2026-09-17 19:18:31.776
4db87c68-9974-4a41-a6ac-4cc5645e428d	MANAGE_USERS.EDIT_ROLE	Edit Role	Change a user's assigned role	2026-08-26 06:10:56.023	2026-09-17 19:18:31.778
53029b90-f373-488e-8540-5e315da15820	MANAGE_USERS.EDIT_SPECIAL_PERMISSIONS	Edit Special Permissions	Change a user's direct/special permission grants	2026-08-26 06:10:56.026	2026-09-17 19:18:31.78
9d1b3d18-8011-46ed-ba4c-0f5d13f2a764	MANAGE_AGENTS.ADD_AGENT	Add Agent	Register a new individual agent or agent company	2026-09-16 03:48:41.218	2026-09-17 19:18:31.79
65c09803-e485-46a1-97d6-361715e6c04e	MANAGE_ACCOUNTING	Accounting	Access the Accounting page	2026-09-16 11:15:17.517	2026-09-17 19:18:31.792
e71ed6fa-1f79-4b13-a967-6aba4c3d3d90	MANAGE_ACCOUNTING.RECORD_PAYMENT	Record Payment	Record a payment made against an agent's payable balance	2026-09-16 11:15:17.52	2026-09-17 19:18:31.794
d3723d4e-2b0c-47c1-a128-1a4acbb3bbbd	CREATE_APPLICATION	Policy Application	Create and manage policy applications	2026-08-26 06:10:56.032	2026-09-17 19:18:31.795
8bd30bae-1c00-4918-9351-294edbe18bec	VIEW_POLICIES.CREATE_ENDORSEMENT	Create Endorsement Request	File an endorsement request against one of your own issued policies	2026-09-16 06:15:57.432	2026-09-17 19:18:31.8
bf429cbb-7c23-421e-9701-0cba2d137eef	MANAGE_INLEASE	In-Lease Backlogs	Manage the In-Lease backlog queue	2026-08-26 06:10:56.038	2026-09-17 19:18:31.801
9cf959f5-1bc9-4f9e-8918-a1d236410600	MANAGE_INLEASE.MARK_DONE	Mark In-Lease Task Done	Submit an in-lease backlog task as accomplished	2026-09-16 02:20:17.91	2026-09-17 19:18:31.803
a38004ab-27f8-4f3b-b650-c36ab86f3aad	MANAGE_INLEASE.MARK_UNDONE	Mark In-Lease Task Undone	Revert an accomplished in-lease backlog task back to pending	2026-09-16 02:20:17.912	2026-09-17 19:18:31.804
732d8610-c90e-4868-8f21-10045cb83c71	APPROVE_APPLICATION	Policy Approval	Approve or reject policy applications	2026-08-26 06:10:56.043	2026-09-17 19:18:31.806
d64eff2f-6c3d-4483-a2a7-9a255711ed1c	APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION	Admin Policy Application	File a policy application under a chosen agent that is created and approved immediately, with the filer recorded as the approver	2026-09-17 19:18:31.808	2026-09-17 19:18:31.808
f0e4982f-51a6-43c1-8681-7353900df7c6	MANAGE_SETTINGS.EDIT_ROLE_PERMISSIONS	Edit Default Role Permissions	Change which permissions a role grants by default	2026-08-26 06:28:34.018	2026-09-17 19:18:31.813
b377f6dd-1a5f-4ffd-b36b-0ae05b305151	MANAGE_SETTINGS.CREATE_ROLE	Create Role	Create a new role with a chosen set of default permissions	2026-08-26 06:42:39.126	2026-09-17 19:18:31.815
6f19d2d1-9d8e-4570-acd5-bab243274da1	MANAGE_SETTINGS.EDIT_CLAUSES	Edit Clauses	Edit the legal clause text attached to each coverage	2026-09-03 21:48:50.028	2026-09-17 19:18:31.817
836f5f15-c492-42e7-8181-3aec7f8f8013	MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_COVERAGE	Add/Remove Coverages	Create and remove coverages	2026-09-15 21:01:38.952	2026-09-17 19:18:31.826
5aebd2e7-a06d-4e83-95f3-335a4340f800	MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_DETAILS	Edit Product Details	Rename or re-code an insurance class, product variant, or coverage	2026-09-15 21:01:38.953	2026-09-17 19:18:31.827
3060476c-6239-4f78-9b1c-717e67291677	QUOTATION_TRACKER.CREATE_QUOTATION	Create Quotation	Create a quotation under your own agent profile	2026-09-14 23:43:52.84	2026-09-17 19:18:31.832
cfa983a1-7ca0-4250-a3ce-4feaf770cfeb	QUOTATION_TRACKER.VIEW_QUOTATION	View Quotations	See the quotations table, scoped to your own agent	2026-09-14 23:43:52.842	2026-09-17 19:18:31.833
952aee2b-aa18-40a7-a711-4ab5308b57c4	MANAGE_SETTINGS.MANAGE_PAYMENT_METHODS	Manage Authorized Payment Methods	Add or remove which payment methods Bethel accepts directly	2026-09-03 22:20:23.05	2026-09-17 19:18:31.818
c3b9a437-610e-4ee2-82a2-f71214925456	QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION	Create Quotation (Any Agent)	Create a quotation under an agent_id other than your own	2026-09-14 23:43:52.843	2026-09-17 19:18:31.835
a79ad8a5-75f6-4f89-9ae1-04dda7703403	QUOTATION_TRACKER.ADMIN_VIEW_QUOTATION	View All Quotations	See every quotation in the system, regardless of agent	2026-09-14 23:43:52.845	2026-09-17 19:18:31.836
01cc0991-b3fb-4d63-987a-96d5afa9bdb4	CREATE_APPLICATION.AGENT_ISSUANCE	Agent Issuance	Submit and issue policy applications	2026-09-03 20:20:30.221	2026-09-17 19:18:31.797
b7710d5d-3c04-4348-8cee-1385be8a44a3	APPROVE_ENDORSEMENT	Endorsement Approval	Review, amend, approve, or reject endorsement requests against issued policies	2026-09-16 06:15:57.441	2026-09-17 19:18:31.81
85bd06dc-4768-4804-b911-4935d1461160	MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING	Manage Coverage Pricing	Choose how a coverage is priced and manage its value/tier pricing tables	2026-09-05 16:01:34.023	2026-09-17 19:18:31.82
31124e10-938c-4ffd-aad8-977a23c079e8	MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_PRICING	Edit Pricing (Manage Products)	Edit a product variant's rates and a coverage's pricing mode/rate/tiers from the Manage Products page	2026-09-15 21:01:38.955	2026-09-17 19:18:31.829
4a2ea454-f653-4b89-b4c0-425510b9984f	VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT	Create Endorsement Request (Any Policy)	File an endorsement request against any policy in the system, regardless of filing agent	2026-09-18 03:59:54.616	2026-09-18 03:59:54.616
4810cbe1-d859-4be9-89b0-fe69c9a2ceeb	MANAGE_USERS.EDIT_USER_DETAILS	Edit User Details	Change a user's name, email, status, or reset their password	2026-08-26 06:10:56.028	2026-09-17 19:18:31.782
a365f4dc-9f82-4e2a-9ff2-5bcf48ac570e	VIEW_POLICIES	My Policies	View issued policies	2026-08-26 06:10:56.035	2026-09-17 19:18:31.798
\.


--
-- Data for Name: Policy; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."Policy" (id, policy_number, application_id, customer_id, company_id, agent_id, agent_name_snapshot, product_variant_id, issue_date, effective_date, expiry_date, policy_status, created_at, updated_at, company_name_snapshot, customer_name_snapshot, agent_code_snapshot, class_name_snapshot, deductible_rate_snapshot, doc_stamps, lgt, misc, remarks, total_premium, variant_name_snapshot, vat, coc_number, sa_number, renewed_policy_number_snapshot, cancelled_at, minimum_deductible_amount_snapshot) FROM stdin;
\.


--
-- Data for Name: PolicyAddress; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PolicyAddress" (id, policy_id, address_id, created_at, role, formatted_address_snapshot) FROM stdin;
\.


--
-- Data for Name: PolicyApplication; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PolicyApplication" (id, insured_type, application_number, customer_id, company_id, company_name_snapshot, agent_id, agent_name_snapshot, product_variant_id, application_date, submission_date, status, remarks, document_folder_name, created_at, updated_at, coverage_start_at, coverage_end_at, total_premium, doc_stamps, vat, lgt, misc, send_policy_to_email, payment_method, payment_remittance, bethel_payment_method_id, source_quotation_id, send_policy_to_email_on_approval, policy_type, renewed_policy_id) FROM stdin;
\.


--
-- Data for Name: PolicyApplicationAddress; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PolicyApplicationAddress" (id, policy_application_id, address_id, created_at, role) FROM stdin;
\.


--
-- Data for Name: PolicyApplicationChange; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PolicyApplicationChange" (id, policy_application_id, application_vehicle_id, application_coverage_id, change_type, change_from, change_to, effective_date, remarks, created_by_user_id, created_at) FROM stdin;
\.


--
-- Data for Name: PolicyApplicationVehicle; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PolicyApplicationVehicle" (id, policy_application_id, vehicle_id, created_at) FROM stdin;
\.


--
-- Data for Name: PolicyCoverage; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PolicyCoverage" (id, policy_id, coverage_id, coverage_amount, premium_amount, created_at, updated_at, clause_snapshot, coverage_code_snapshot, coverage_name_snapshot, pricing_mode_snapshot, payable_to_bethel, applied_rate, is_misc_snapshot, policy_vehicle_id, added_by_endorsement_id, removed_at, removed_by_endorsement_id) FROM stdin;
\.


--
-- Data for Name: PolicyQuotation; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PolicyQuotation" (id, insured_type, quotation_number, customer_id, company_id, company_name_snapshot, agent_id, agent_name_snapshot, product_variant_id, coverage_start_at, coverage_end_at, quotation_date, total_premium, doc_stamps, vat, lgt, misc, send_policy_to_email, remarks, created_at, updated_at, renewed_policy_id) FROM stdin;
\.


--
-- Data for Name: PolicyQuotationAddress; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PolicyQuotationAddress" (id, policy_quotation_id, address_id, role, created_at) FROM stdin;
\.


--
-- Data for Name: PolicyQuotationVehicle; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PolicyQuotationVehicle" (id, policy_quotation_id, vehicle_id, created_at) FROM stdin;
\.


--
-- Data for Name: PolicyVehicle; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."PolicyVehicle" (id, policy_id, vehicle_id, created_at, chassis_number_snapshot, color_snapshot, engine_number_snapshot, make_snapshot, model_snapshot, mv_file_no_snapshot, no_of_seats_snapshot, plate_number_snapshot, vehicle_type_snapshot, year_model_snapshot) FROM stdin;
\.


--
-- Data for Name: ProductCoverage; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."ProductCoverage" (id, product_variant_id, coverage_code, coverage_name, maximum_coverage, status, created_at, updated_at, clause, pricing_mode, is_misc) FROM stdin;
1e966b25-61ef-4a63-9652-d7d1dd64b013	045eb956-0e90-4ea8-b88b-ec7f0bc3d854	PC_OD	Own Damage	20000000.00	ACTIVE	2026-08-26 07:53:25.169	2026-09-17 20:34:28.808	This Company shall indemnify the Insured against accidental loss of or damage to the insured vehicle and its accessories, including the reasonable cost of towing to the nearest repair shop, subject to the excess/deductible stated in the Policy Schedule.	VALUE_PERCENTAGE	f
cad84277-605a-4fa6-afb5-c65b138d0aaf	045eb956-0e90-4ea8-b88b-ec7f0bc3d854	PC_AOG	Acts of God	20000000.00	ACTIVE	2026-08-26 07:53:25.166	2026-09-17 20:34:38.816	This Company shall indemnify the Insured against loss of or damage to the insured vehicle caused by earthquake, flood, typhoon, volcanic eruption, and other fortuitous events commonly classified as Acts of God, subject to the terms, conditions, and exclusions of this Policy.	VALUE_PERCENTAGE	f
0d79c8d1-c10b-448d-8a98-e135a8b9ea87	045eb956-0e90-4ea8-b88b-ec7f0bc3d854	PC_PA	Personal Accident	200000.00	ACTIVE	2026-08-26 07:53:25.161	2026-09-17 21:19:15.201	This Company shall pay the Insured the benefits stated herein in the event of accidental bodily injury to any authorized passenger, including the driver, arising directly from an accident involving the insured vehicle, resulting in death or disablement within ninety (90) days from the date of the accident.	VEHICLE_SEATS_BASED	f
4fc358ff-fb46-4923-b1b7-dfd34e759f92	045eb956-0e90-4ea8-b88b-ec7f0bc3d854	PC_PD	Property Damage	1000000.00	ACTIVE	2026-09-17 20:00:11.005	2026-09-17 20:00:11.005	You are woopers	FLAT_TIER	f
67c89b3f-f1c7-42d3-bf3c-f8ee6a320f2a	045eb956-0e90-4ea8-b88b-ec7f0bc3d854	PC_BI	Bodily Injury	1000000.00	ACTIVE	2026-09-17 20:03:09.633	2026-09-17 20:03:09.633	you are a pc body outch	FLAT_TIER	f
1dc807d4-5be2-47b1-86b3-387e5392e853	a9d7e10b-bb10-413c-a96e-e758898a6569	CV_AOG	Acts of God	2000000.00	ACTIVE	2026-09-18 05:38:26.286	2026-09-18 05:38:26.286	Clause for AOG	VALUE_PERCENTAGE	f
\.


--
-- Data for Name: ProductVariant; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."ProductVariant" (id, insurance_class_id, variant_code, variant_name, description, status, created_at, updated_at, deductible_rate, misc_fee, gross_target_coverage_id, minimum_deductible_amount) FROM stdin;
045eb956-0e90-4ea8-b88b-ec7f0bc3d854	a5500c82-af8a-4d9d-ab49-8788ba2cac20	PC	Private Car	\N	ACTIVE	2026-08-26 07:53:25.156	2026-09-17 23:19:19.009	0.0050	150.00	1e966b25-61ef-4a63-9652-d7d1dd64b013	2000.00
a9d7e10b-bb10-413c-a96e-e758898a6569	a5500c82-af8a-4d9d-ab49-8788ba2cac20	CV_H	Commercial Vehicle Heavy (Own Goods)	This is a commercial Vehicle Description (heavy)	ACTIVE	2026-09-18 05:36:05.865	2026-09-18 05:36:21.875	0.0100	225.00	\N	0.00
a062553d-fe59-4dd8-ad12-63cd4c218e22	a5500c82-af8a-4d9d-ab49-8788ba2cac20	CV_LM	Commercial Vehicle Light and Medium (Own Goods)	This is a Commercial Vehicle Description	ACTIVE	2026-09-18 05:35:14.565	2026-09-18 05:37:28.492	0.0100	225.00	\N	0.00
\.


--
-- Data for Name: QuotationCoverage; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."QuotationCoverage" (id, quotation_id, coverage_id, policy_quotation_vehicle_id, coverage_amount, premium_amount, payable_to_bethel, applied_rate, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: Role; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."Role" (id, role_name, description, created_at, updated_at) FROM stdin;
a63d2c5c-f59d-4121-82f9-1c1497226fbb	Bethel System Administrator	Full system access	2026-09-18 01:10:35.281	2026-09-18 01:10:35.281
973992b1-3b30-4bf0-a6bc-0bf6885cae8f	Bethel Accounting	\N	2026-09-18 03:58:43.182	2026-09-18 03:58:43.182
adf25068-0026-4a76-ba82-37aede8f1e5d	Bethel Underwriter	\N	2026-09-18 03:59:56.153	2026-09-18 03:59:56.153
2fd4d42e-ca6e-4ece-8f86-24cd4c281904	Agent	\N	2026-09-18 05:49:53.482	2026-09-18 05:49:53.482
\.


--
-- Data for Name: RolePermission; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."RolePermission" (id, role_id, permission_id, created_at) FROM stdin;
616a1708-86a9-400a-8501-5fc22b6dcecb	a63d2c5c-f59d-4121-82f9-1c1497226fbb	1fd11702-c0f2-4dd4-9961-091847e4d762	2026-09-18 01:10:35.291
ce5a003a-624f-4300-8f13-6d66ab7c6bf4	a63d2c5c-f59d-4121-82f9-1c1497226fbb	e31073fa-fbb5-42b3-bfc0-d0d759dd7a59	2026-09-18 01:10:35.291
9552e200-db4f-4014-9f53-95c1ff70e4a8	a63d2c5c-f59d-4121-82f9-1c1497226fbb	3ab5ad79-4e5c-4d3c-a9a2-38c7d20e159d	2026-09-18 01:10:35.291
5551026c-fd22-4117-b4ed-025ca9de01d9	a63d2c5c-f59d-4121-82f9-1c1497226fbb	981da83d-8cac-4047-ba19-bd291acface5	2026-09-18 01:10:35.291
b2385fb3-5751-4dd2-8054-f1baaecb70d4	a63d2c5c-f59d-4121-82f9-1c1497226fbb	48d9bd5a-4456-4272-8905-017e9ec4006c	2026-09-18 01:10:35.291
b6ab4471-d1c9-4d6c-aeac-6cc0450cbfa8	a63d2c5c-f59d-4121-82f9-1c1497226fbb	ca4a8798-30f7-40dc-98f2-6de83da053d3	2026-09-18 01:10:35.291
60a73c71-7c92-4630-a806-12ad4f695d07	a63d2c5c-f59d-4121-82f9-1c1497226fbb	56c5bd5a-cb4f-4688-b152-311f3473be3e	2026-09-18 01:10:35.291
b5e534f8-e4cc-463b-8d69-bac8c75fc8bf	a63d2c5c-f59d-4121-82f9-1c1497226fbb	35f0577c-711f-4727-8410-6878bbe26924	2026-09-18 01:10:35.291
2339b1f8-6ed3-4c36-b197-e5f31b15a07d	a63d2c5c-f59d-4121-82f9-1c1497226fbb	e81c4da9-2500-4977-9cda-a4ca8084bf40	2026-09-18 01:10:35.291
7d9e824b-752b-4c22-862c-4ac4577f5a1a	a63d2c5c-f59d-4121-82f9-1c1497226fbb	c7473228-8ba3-4615-8f7a-f913fec9b003	2026-09-18 01:10:35.291
5ed7f202-127a-4105-8462-3fde8ede29b6	a63d2c5c-f59d-4121-82f9-1c1497226fbb	4db87c68-9974-4a41-a6ac-4cc5645e428d	2026-09-18 01:10:35.291
e9cce9b7-1f53-4adb-be23-e5a670dd512c	a63d2c5c-f59d-4121-82f9-1c1497226fbb	53029b90-f373-488e-8540-5e315da15820	2026-09-18 01:10:35.291
8444b64e-10a1-40cd-860c-fcd5f9036d80	a63d2c5c-f59d-4121-82f9-1c1497226fbb	9d1b3d18-8011-46ed-ba4c-0f5d13f2a764	2026-09-18 01:10:35.291
edd99e68-c730-4486-94e7-cf5192a34f58	a63d2c5c-f59d-4121-82f9-1c1497226fbb	65c09803-e485-46a1-97d6-361715e6c04e	2026-09-18 01:10:35.291
adba1448-da4f-4ff5-baaf-b1baf8872ae1	a63d2c5c-f59d-4121-82f9-1c1497226fbb	e71ed6fa-1f79-4b13-a967-6aba4c3d3d90	2026-09-18 01:10:35.291
41dcc404-92d2-472b-babe-fe46949420a0	a63d2c5c-f59d-4121-82f9-1c1497226fbb	d3723d4e-2b0c-47c1-a128-1a4acbb3bbbd	2026-09-18 01:10:35.291
c5e94763-8208-48b9-8ace-24d257baeed9	a63d2c5c-f59d-4121-82f9-1c1497226fbb	8bd30bae-1c00-4918-9351-294edbe18bec	2026-09-18 01:10:35.291
95057066-c3e0-41f6-9daa-20e6dddcb840	a63d2c5c-f59d-4121-82f9-1c1497226fbb	bf429cbb-7c23-421e-9701-0cba2d137eef	2026-09-18 01:10:35.291
15492653-bca2-4a17-b55f-0ad77b144f84	a63d2c5c-f59d-4121-82f9-1c1497226fbb	9cf959f5-1bc9-4f9e-8918-a1d236410600	2026-09-18 01:10:35.291
ac886af1-736e-49a8-b0b7-ffb470a1321c	a63d2c5c-f59d-4121-82f9-1c1497226fbb	a38004ab-27f8-4f3b-b650-c36ab86f3aad	2026-09-18 01:10:35.291
f3380507-0fd4-4202-a058-ea54f82ada21	a63d2c5c-f59d-4121-82f9-1c1497226fbb	732d8610-c90e-4868-8f21-10045cb83c71	2026-09-18 01:10:35.291
30efdb1a-0b7e-4a27-91f4-5ab043fb4d88	a63d2c5c-f59d-4121-82f9-1c1497226fbb	d64eff2f-6c3d-4483-a2a7-9a255711ed1c	2026-09-18 01:10:35.291
0b23c501-94ee-4da1-a029-7d154c33b6c1	a63d2c5c-f59d-4121-82f9-1c1497226fbb	f0e4982f-51a6-43c1-8681-7353900df7c6	2026-09-18 01:10:35.291
23a91afd-b029-401f-89de-927fe3af0a3c	a63d2c5c-f59d-4121-82f9-1c1497226fbb	b377f6dd-1a5f-4ffd-b36b-0ae05b305151	2026-09-18 01:10:35.291
1e64507d-60d6-4488-95f4-354c9f24a83a	a63d2c5c-f59d-4121-82f9-1c1497226fbb	6f19d2d1-9d8e-4570-acd5-bab243274da1	2026-09-18 01:10:35.291
d6b66e82-5e41-4978-a015-2b931f49083e	a63d2c5c-f59d-4121-82f9-1c1497226fbb	836f5f15-c492-42e7-8181-3aec7f8f8013	2026-09-18 01:10:35.291
41e48f0f-b6d8-4b43-9944-9122d255c324	a63d2c5c-f59d-4121-82f9-1c1497226fbb	5aebd2e7-a06d-4e83-95f3-335a4340f800	2026-09-18 01:10:35.291
b43d374a-7276-4fa9-9133-adf71488f6da	a63d2c5c-f59d-4121-82f9-1c1497226fbb	3060476c-6239-4f78-9b1c-717e67291677	2026-09-18 01:10:35.291
d7000c31-54eb-4f9b-a97d-3735d3d4027f	a63d2c5c-f59d-4121-82f9-1c1497226fbb	cfa983a1-7ca0-4250-a3ce-4feaf770cfeb	2026-09-18 01:10:35.291
2d355fbc-f8ab-4273-9a80-b749e3826e1c	a63d2c5c-f59d-4121-82f9-1c1497226fbb	952aee2b-aa18-40a7-a711-4ab5308b57c4	2026-09-18 01:10:35.291
f0646f37-a217-4c27-8056-921468ff4804	a63d2c5c-f59d-4121-82f9-1c1497226fbb	c3b9a437-610e-4ee2-82a2-f71214925456	2026-09-18 01:10:35.291
8d09d1fb-3a5a-4f70-ab34-fe1a261f7dee	a63d2c5c-f59d-4121-82f9-1c1497226fbb	a79ad8a5-75f6-4f89-9ae1-04dda7703403	2026-09-18 01:10:35.291
606dcb5c-00ef-40f0-89bc-e25ed81cdbaa	a63d2c5c-f59d-4121-82f9-1c1497226fbb	01cc0991-b3fb-4d63-987a-96d5afa9bdb4	2026-09-18 01:10:35.291
a5364f62-cb5f-4fa4-9c8f-a4b98543f344	a63d2c5c-f59d-4121-82f9-1c1497226fbb	b7710d5d-3c04-4348-8cee-1385be8a44a3	2026-09-18 01:10:35.291
1edc68f7-224e-4d5d-9b7b-2b9f8c1ec32b	a63d2c5c-f59d-4121-82f9-1c1497226fbb	85bd06dc-4768-4804-b911-4935d1461160	2026-09-18 01:10:35.291
ab2786c8-93d5-4e4a-8f16-fe56976728c2	a63d2c5c-f59d-4121-82f9-1c1497226fbb	31124e10-938c-4ffd-aad8-977a23c079e8	2026-09-18 01:10:35.291
f28daf2d-4315-403c-818d-ae87002756de	a63d2c5c-f59d-4121-82f9-1c1497226fbb	4810cbe1-d859-4be9-89b0-fe69c9a2ceeb	2026-09-18 01:10:35.291
086b8507-f5ee-4126-bda0-265aef95262c	a63d2c5c-f59d-4121-82f9-1c1497226fbb	a365f4dc-9f82-4e2a-9ff2-5bcf48ac570e	2026-09-18 01:10:35.291
69867525-9099-49af-b2c5-0fa586961bf5	973992b1-3b30-4bf0-a6bc-0bf6885cae8f	e71ed6fa-1f79-4b13-a967-6aba4c3d3d90	2026-09-18 03:58:43.182
a4b7512a-a2b1-4d79-b87b-ec89433fd5c7	973992b1-3b30-4bf0-a6bc-0bf6885cae8f	65c09803-e485-46a1-97d6-361715e6c04e	2026-09-18 03:58:43.182
03ff481c-b5a8-4dd9-a8cc-4e3301eaf90a	a63d2c5c-f59d-4121-82f9-1c1497226fbb	4a2ea454-f653-4b89-b4c0-425510b9984f	2026-09-18 03:59:54.659
a67713a5-c293-48ae-90c5-0f997f3c0388	973992b1-3b30-4bf0-a6bc-0bf6885cae8f	4a2ea454-f653-4b89-b4c0-425510b9984f	2026-09-18 03:59:54.664
15807351-b18e-493b-adc5-285a722ebf38	adf25068-0026-4a76-ba82-37aede8f1e5d	9cf959f5-1bc9-4f9e-8918-a1d236410600	2026-09-18 03:59:56.153
d83c9bfb-2be8-440d-88ad-9a701ec9e617	adf25068-0026-4a76-ba82-37aede8f1e5d	a38004ab-27f8-4f3b-b650-c36ab86f3aad	2026-09-18 03:59:56.153
afeb1657-0a15-456e-8f3f-99e957716a3a	adf25068-0026-4a76-ba82-37aede8f1e5d	c7473228-8ba3-4615-8f7a-f913fec9b003	2026-09-18 03:59:56.153
ec9dba7f-69dc-4826-840e-1fb65e737f58	adf25068-0026-4a76-ba82-37aede8f1e5d	9d1b3d18-8011-46ed-ba4c-0f5d13f2a764	2026-09-18 03:59:56.153
d4f077a2-c582-4519-9357-2fd0a777bc01	adf25068-0026-4a76-ba82-37aede8f1e5d	35f0577c-711f-4727-8410-6878bbe26924	2026-09-18 03:59:56.153
ea508d58-a3e0-4df4-9fda-b9439669470b	adf25068-0026-4a76-ba82-37aede8f1e5d	8bd30bae-1c00-4918-9351-294edbe18bec	2026-09-18 03:59:56.153
dea5fdc6-e2ac-4f0b-851e-5c96e4bf2f63	adf25068-0026-4a76-ba82-37aede8f1e5d	01cc0991-b3fb-4d63-987a-96d5afa9bdb4	2026-09-18 03:59:56.153
70f11888-7a8e-41a2-9101-ecdd79e213f7	adf25068-0026-4a76-ba82-37aede8f1e5d	d64eff2f-6c3d-4483-a2a7-9a255711ed1c	2026-09-18 03:59:56.153
daf9e96b-419c-4e2b-a9d0-8644e4240bcd	adf25068-0026-4a76-ba82-37aede8f1e5d	c3b9a437-610e-4ee2-82a2-f71214925456	2026-09-18 03:59:56.153
db916536-f6bb-4960-896f-cfe8b30ab244	adf25068-0026-4a76-ba82-37aede8f1e5d	a79ad8a5-75f6-4f89-9ae1-04dda7703403	2026-09-18 03:59:56.153
55896784-0c0e-48a1-955f-0fa4f316004d	adf25068-0026-4a76-ba82-37aede8f1e5d	48d9bd5a-4456-4272-8905-017e9ec4006c	2026-09-18 03:59:56.153
5f3ebaa6-d192-4dd0-b551-dab096296de8	adf25068-0026-4a76-ba82-37aede8f1e5d	ca4a8798-30f7-40dc-98f2-6de83da053d3	2026-09-18 03:59:56.153
ba18c977-e32c-4ba1-800c-a2abc8b06b56	adf25068-0026-4a76-ba82-37aede8f1e5d	e81c4da9-2500-4977-9cda-a4ca8084bf40	2026-09-18 03:59:56.153
f4ee871e-f157-469a-9a91-694493ed2c8f	adf25068-0026-4a76-ba82-37aede8f1e5d	d3723d4e-2b0c-47c1-a128-1a4acbb3bbbd	2026-09-18 03:59:56.153
4f03d19a-6ac9-4211-8f09-b21d5dd9d8b5	adf25068-0026-4a76-ba82-37aede8f1e5d	bf429cbb-7c23-421e-9701-0cba2d137eef	2026-09-18 03:59:56.153
7017d087-64cb-4f1e-856e-94e4eb9fc07b	adf25068-0026-4a76-ba82-37aede8f1e5d	732d8610-c90e-4868-8f21-10045cb83c71	2026-09-18 03:59:56.153
80fb769c-9538-45b9-ae1b-af5af068b9cc	adf25068-0026-4a76-ba82-37aede8f1e5d	a365f4dc-9f82-4e2a-9ff2-5bcf48ac570e	2026-09-18 03:59:56.153
7c89e75d-7d75-48d3-9f75-ad09297929be	2fd4d42e-ca6e-4ece-8f86-24cd4c281904	01cc0991-b3fb-4d63-987a-96d5afa9bdb4	2026-09-18 05:49:53.482
db489f83-daed-4860-9f17-3b355ee73ab0	2fd4d42e-ca6e-4ece-8f86-24cd4c281904	3060476c-6239-4f78-9b1c-717e67291677	2026-09-18 05:49:53.482
c2d9a5a5-93ae-4209-b047-3d2ee4f6d53b	2fd4d42e-ca6e-4ece-8f86-24cd4c281904	cfa983a1-7ca0-4250-a3ce-4feaf770cfeb	2026-09-18 05:49:53.482
3aa95bd8-2ac8-4a13-8fc4-ec62aa8eeaf9	2fd4d42e-ca6e-4ece-8f86-24cd4c281904	48d9bd5a-4456-4272-8905-017e9ec4006c	2026-09-18 05:49:53.482
aa50f9d6-0974-4684-9712-921836765952	2fd4d42e-ca6e-4ece-8f86-24cd4c281904	d3723d4e-2b0c-47c1-a128-1a4acbb3bbbd	2026-09-18 05:49:53.482
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."User" (id, email, password_hash, full_name, status, agent_id, customer_id, created_at, updated_at, email_verified_at, invite_token, invite_token_expires_at) FROM stdin;
833638f3-1aa5-459c-9d22-9dbc83495744	ejnavarro555@gmail.com	$2b$12$4xP5RAlPiJ6.CTySJExgwObuUdgQ1ZMrt/CR32j7h0X0lYINjVaeK	System Admin	ACTIVE	f3c382ae-fb35-49b2-9076-3dd56e20ca48	\N	2026-09-18 01:10:35.468	2026-09-18 01:20:21.223	\N	\N	\N
b155f59d-7472-4e33-99e7-0fc4b77b7c8e	ejnavarro0117@gmail.com	$2b$12$Z2qHq06e2W/SfSCZWkm/d.4YER5OYFo9z/0.MIWVDWPMNDBiTEnGm	Bethel Agent	ACTIVE	f3c382ae-fb35-49b2-9076-3dd56e20ca48	\N	2026-09-18 05:50:16.315	2026-09-18 05:50:47.755	2026-09-18 05:50:47.754	\N	\N
\.


--
-- Data for Name: UserPermission; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."UserPermission" (id, user_id, permission_id, created_at) FROM stdin;
\.


--
-- Data for Name: UserRole; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."UserRole" (id, user_id, role_id, created_at) FROM stdin;
26bb7982-5f8b-4330-9c22-24e434dcade4	833638f3-1aa5-459c-9d22-9dbc83495744	a63d2c5c-f59d-4121-82f9-1c1497226fbb	2026-09-18 01:20:21.23
ff3f63f4-5f1a-4d2b-a5ec-510cac93a862	b155f59d-7472-4e33-99e7-0fc4b77b7c8e	2fd4d42e-ca6e-4ece-8f86-24cd4c281904	2026-09-18 05:50:16.315
\.


--
-- Data for Name: Vehicle; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public."Vehicle" (id, plate_number, engine_number, chassis_number, make, model, year_model, vehicle_type, color, created_at, updated_at, mv_file_no, estimated_value, initial_assessment_date, no_of_seats, product_variant_id) FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: policyapp
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
bbf78fd4-5b72-4437-88fa-13d0ec2fb2de	7de679dc4fbdb7c9441b7718a2e808b5d74a0d014e4877203d231e4467667dd7	2026-08-18 07:20:29.020034+00	20260818072028_init	\N	\N	2026-08-18 07:20:28.329557+00	1
b536fe04-9345-4562-8b1c-cf31d5a969d8	f387a3e2d6aeb61a7762a1b29bc6bdac01ae9ab546692578dbcda6cb8701467c	2026-08-18 14:43:25.601956+00	20260818144315_permission_code_unique	\N	\N	2026-08-18 14:43:25.590098+00	1
eea1e0a3-986b-4e61-a830-33dee339bb9f	3e3afcb4af56f17ab471850f0922afdcd758a89c6945f739aafc2ea52d1b234b	2026-09-03 21:24:36.243594+00	20260904060000_vehicle_mv_file_no	\N	\N	2026-09-03 21:24:36.225454+00	1
b6615554-3e4a-408c-8c30-8963294d2029	bb0357209228842c974586d50d73fb449a0bde6abc661fb49d2bbea9e6e8f65a	2026-08-26 04:56:20.631652+00	20260826045620_policy_inlease_tracking	\N	\N	2026-08-26 04:56:20.61533+00	1
da7c0ded-e3ec-4365-bffd-3cbcfa89a6da	e986c736ab3d5028db6ab6bf642afb2ec3147c19166887d91ad3d745c752d6da	2026-08-26 05:54:10.570009+00	20260826055346_user_invite_flow	\N	\N	2026-08-26 05:54:10.553816+00	1
058be6ab-e048-474f-9e76-713fbd2913e9	2a8973bd30a6dc635869b124018bbbde15d0cb8af2d606d5c2548dd6af128cde	2026-09-11 23:35:16.913933+00	20260912100000_agent_tier_pricing_overrides	\N	\N	2026-09-11 23:35:16.866618+00	1
85ea1847-7e44-4615-a263-b00f16806b9a	4f23a655e8a4f4441f2853e9470febb4e72860202a8e9dd10ce73fabfcc922c8	2026-08-26 06:50:39.962214+00	20260826065003_permission_page_group	\N	\N	2026-08-26 06:50:39.947694+00	1
2aa9653c-3fcd-492b-a21d-cf3dc147266e	15715a31b15969bf30150e67e32ada0455cd1ad58aa42a26a671da92fecf5d85	2026-09-03 22:05:45.20209+00	20260904070000_policy_application_payment_fields	\N	\N	2026-09-03 22:05:45.176562+00	1
abca5b4e-e76e-47f0-8e35-50a957f68df5	d931e89785cc8ddaf286dadf7b2c76617fbb5a6a370ed8996b3bf26c989662f4	2026-08-26 07:05:01.731574+00	20260826070451_permission_page_access_flag	\N	\N	2026-08-26 07:05:01.720437+00	1
548c79d4-b5e0-4f74-842e-6e3d2827582d	8f7de4c99a51ef2a9e64057206e6c51b23e9ce2bb4b7430ce29bc5ade9488c3d	2026-08-26 07:51:16.877671+00	20260826075116_customer_company_agents	\N	\N	2026-08-26 07:51:16.828847+00	1
09ebc869-2808-4adc-919b-1d28bfaedeb5	624eb996e05c130e2bb89f9d000dd67c7dace42ffa235c900776196718580af6	2026-08-26 07:53:17.086398+00	20260826075305_insurance_class_name_unique	\N	\N	2026-08-26 07:53:17.069921+00	1
8b9c98e2-eacf-4dd9-bde0-80e071b208a1	fc67a1771097aeab660e664a05b6915c8b8bec901e20c53907bde90e2d217d5a	2026-09-03 22:19:40.772371+00	20260904080000_payment_methods_and_address_roles	\N	\N	2026-09-03 22:19:40.728027+00	1
66534f82-b357-4935-8826-47e5eb308b8a	211ab037fb55184fa6943a62e76cf1a3181f218163ce0ab92e5fb61daca08d4f	2026-08-26 08:12:39.544013+00	20260826081226_application_coverage_period	\N	\N	2026-08-26 08:12:39.527649+00	1
6dc8353d-3c64-408e-aa72-db0b3b1eedf6	b2e5b1d45180e64c4078cf7ec200e9a4f38a3576486a50d512f540f8e501f5bd	2026-09-03 19:30:30.910518+00	20260904033000_coverage_rate_and_clause	\N	\N	2026-09-03 19:30:30.8772+00	1
85d35838-fbb2-4577-b61c-a58939aca192	c60896beb6ea1f437faf2118ea326264b46da820c903ecd8f5ed4136fa8717b6	2026-09-12 05:32:48.788899+00	20260912140000_period_scoped_pricing	\N	\N	2026-09-12 05:32:48.685626+00	1
1b8e7bd2-36cc-4dad-bc1e-20c434963f5b	b5845699c555984b818b9efc8a3e8c34ebd3f75164f27d6b7fd125c960dcbd94	2026-09-03 19:33:58.691484+00	20260904033500_agent_netrate_nullable_max_unique	\N	\N	2026-09-03 19:33:58.633243+00	1
e662d1e3-b5b0-488b-b99f-4301fbad3736	39accaed3fcde87c749aa21a2c8c56ffbfe26bc5bbeb016427807fe69fcb5111	2026-09-05 12:54:53.495647+00	20260905130000_vehicle_estimated_value	\N	\N	2026-09-05 12:54:53.484328+00	1
816b5da4-3de3-4c76-b94a-5d7d3d537faf	0aa8d2116b4d2bea0358f294e83f5205dc89ded965311150bc02710f68e9ccff	2026-09-03 19:45:57.654262+00	20260904040000_application_coverage_applied_rate	\N	\N	2026-09-03 19:45:57.641431+00	1
2764443b-6c60-4529-b647-65b2b77a1ad1	b79a7f24dc90bc168f4c34fa83e33e4b1ef37453d77a3ae56c9542593431ac46	2026-09-03 20:51:17.609493+00	20260904050000_policy_application_charges	\N	\N	2026-09-03 20:51:17.579486+00	1
7e5b3793-1be0-4c0e-b6c3-292c039cdbc9	ca65d5e53f16c9972017ad4f8b64f10922dc1af7d1a6a7a129145094448fcc94	2026-09-11 23:46:10.006701+00	20260912110000_merge_party_vehicle_address	\N	\N	2026-09-11 23:46:09.945119+00	1
9c90645e-3188-4545-b3b2-b2177fec0984	5ad8e67edcd98f5603874aab1998c9bbca6ac75e35bbe3765f89a871f7fa1aa0	2026-09-05 15:32:16.920078+00	20260905140000_coverage_pricing_modes	\N	\N	2026-09-05 15:32:16.853242+00	1
1583056e-c84d-4978-9575-1aa3cd8d250d	c48cf8a5ca508da528d5bd56734efe7d59fbdbf641f415b150694d4b6236452e	2026-09-06 02:02:33.511667+00	20260906090000_application_coverage_vehicle_scope	\N	\N	2026-09-06 02:02:33.481527+00	1
21b97e69-2b70-4c05-9771-148e924f23bf	34305991a466ace1cc0c025d120c6f2adf93e282259cb24b514f34e3c6875044	2026-09-06 02:02:33.537036+00	20260906100000_coverage_percentage_pricing	\N	\N	2026-09-06 02:02:33.513186+00	1
53b8ea46-b7f4-401b-8ea0-aa2c2f06c753	3dbb1690e76e8f9e2c2e351c19bc6b0fd76e93565697e4944025f5bc6fd9ca53	2026-09-12 02:57:07.928277+00	20260912120000_application_coverage_bethel_pricing	\N	\N	2026-09-12 02:57:07.899069+00	1
a7c97188-1e1f-44ed-840d-dffa4c79889c	d911d83be90988237bb66395dec20887e826fae27a6af31d8e038752bc13344b	2026-09-11 23:18:57.215882+00	20260912090000_dot_namespaced_permissions	\N	\N	2026-09-11 23:18:57.172342+00	1
adef2d55-dce1-4aac-aa64-de906cf75421	6b276981c2c333b21f48e208a876b37c4d60214308fd8957bc881f9cb8d4db6f	2026-09-15 00:03:53.432415+00	20260915000353_add_variant_rates_and_vehicle_seats	\N	\N	2026-09-15 00:03:53.42596+00	1
84d60e15-b442-4a71-9186-9769b181e7e0	5f61f1b0a15716cfc18167c96ae2c149b0e6ee668d5a94e2e1499895bc6d9226	2026-09-12 05:07:44.126643+00	20260912130000_coverage_allowable_periods	\N	\N	2026-09-12 05:07:44.071421+00	1
03091c58-800c-4e61-8c8d-bee241626d93	c4464febb1a481c3292d2a942d1ba5e0e935c50f3e6b4ceb78eb613944b3e7cc	2026-09-12 08:05:15.297657+00	20260912160000_policy_quotations	\N	\N	2026-09-12 08:05:15.146019+00	1
3ef53b0b-6fbf-4b59-875c-98b30af6c70e	c81af740c43e395aa8d8e6d1e838f51eaa2d3e17e06c3ec3096da0005d1bf530	2026-09-14 21:19:44.146474+00	20260914211944_add_address_estimated_value	\N	\N	2026-09-14 21:19:44.09837+00	1
e6c79d9b-7920-4f27-85d4-d1a0b4113c01	bc6326bcb42e60757624230f7db25c99311a112cb50409a5109d19a526c1290f	2026-09-12 08:34:43.038239+00	20260912170000_policy_snapshots	\N	\N	2026-09-12 08:34:43.019309+00	1
243e3321-70ba-4cfa-866e-aadcd78bea02	c456573f2c018ef7f7e15381a391748aba02dcf18cdc1976e31fd59029ae44dd	2026-09-14 20:36:05.254317+00	20260915000000_add_quotation_to_application_link	\N	\N	2026-09-14 20:36:05.234023+00	1
9e42ce40-f006-4447-9783-ca3c6d681889	d130a49e74a88b1172a03507517bb8cbcab8a109357fc388682e1d3716fe4ef6	2026-09-14 22:14:46.418423+00	20260914221446_add_send_policy_to_email_on_approval	\N	\N	2026-09-14 22:14:46.412932+00	1
457c0e7c-ef80-4cdf-a205-62782f8a1628	057663173b2577a35610b86ad6eb5403b3141b1f671fd13d3bd215d1860b659a	2026-09-14 21:56:36.66628+00	20260914215636_add_policy_application_changes	\N	\N	2026-09-14 21:56:36.630052+00	1
e33d9103-d8c5-407b-9c19-3fc2ff0b43c6	2ab0445297c1d25caffe3f967db93a9a8644ce064264954ba29d528d2a2c074c	2026-09-15 04:42:25.835268+00	20260915044109_policy_full_snapshot	\N	\N	2026-09-15 04:42:25.805013+00	1
ae79be4d-b6d6-46e8-958d-26c93d2dcf5e	5c754a1ab7c57de331e602a6d45e5bf34ef5646564edaf47680b563dbc20c363	2026-09-15 05:30:20.547618+00	20260915053020_add_policy_coc_sa_numbers	\N	\N	2026-09-15 05:30:20.542614+00	1
53b05f3a-afec-440f-af68-dabb1312b721	e620dff7fad192578a93d5c14559e8fd64b81a9437488bf9665d7dec06653200	2026-09-15 06:11:50.905596+00	20260915061150_add_application_policy_type_renewal	\N	\N	2026-09-15 06:11:50.889276+00	1
7bde797e-70d9-49c3-a08f-2c63f41e0836	0e93918468a778c6b3d8caef30e2576b5f666a90131f7419e680c5587075d02b	2026-09-15 22:59:10.755025+00	20260915225910_add_quotation_renewal_link	\N	\N	2026-09-15 22:59:10.738261+00	1
2e2577e7-fe7e-4cb2-b81e-ab1303b871e3	61a5bd3e0b685934dfc398385f9782b4c1e410a98cad3f2ede5100b85b531219	2026-09-16 02:19:27.173717+00	20260916060000_add_inlease_backlog_table	\N	\N	2026-09-16 02:19:27.137432+00	1
8776d609-a340-4c1d-9d6c-e920151c42f6	2bc5f9456df5c416d300c352a009fba763909795e395bd2c9d7ab03df5b047d1	2026-09-16 03:47:57.035044+00	20260916034745_add_agent_type_and_company	\N	\N	2026-09-16 03:47:57.018299+00	1
1e98b842-b81b-42dc-9dea-80686504b387	9d412fdb23d8b66562fb878d8b6b8dc26751c64ad6d6b7e7290da9daa1fa2238	2026-09-16 04:21:19.66067+00	20260916120000_towing_and_seats_pricing	\N	\N	2026-09-16 04:21:19.615998+00	1
13cef832-be36-4fb8-866f-f3e68c37dbb3	051cc4aaae22bcf9c0af8cdc41631eced1aad03a29628a01a6fdbc3ed820329b	2026-09-16 04:55:43.290398+00	20260916150000_misc_fee_seats_tiers_agent_company	\N	\N	2026-09-16 04:55:43.229518+00	1
167fb4e2-7846-4f98-bcc4-4803eaaeaab6	db3e3599d594fabdf8547aacfa680ba2726aa195d9bb87564977476c3f41dac7	2026-09-16 06:03:51.533731+00	20260916180000_endorsement_requests	\N	\N	2026-09-16 06:03:51.440594+00	1
8490d35c-f47c-454c-ad5a-5187b0e68b42	6fcaf3fe87fc800c3bd0ae5f6d890fb867bd7568039b82242a1cba112fbb9009	2026-09-16 09:04:58.988789+00	20260916190000_coverage_is_misc_and_renewal_number	\N	\N	2026-09-16 09:04:58.973396+00	1
bf962c86-2d68-4f72-8ee4-ef70444be666	c688e4267db55cb6c6dd50c4a32ada4a6784515301dbbe3003c81c83537420fb	2026-09-16 09:36:59.733817+00	20260916200000_add_endorsement_inlease_link	\N	\N	2026-09-16 09:36:59.713522+00	1
31ec1d38-fe62-4bef-98ca-c9c84541c83c	98f46a3d91b13d2482e33e98be9746f5c1a95c73966ad9eda94d32229773c41a	2026-09-16 10:51:09.268973+00	20260916210000_add_agent_payable_transaction	\N	\N	2026-09-16 10:51:09.220689+00	1
0b6d1540-9a5d-47d0-a3b9-f83aedbc51f4	manual	2026-09-16 11:08:26.04294+00	20260916220000_agent_payable_type_and_balance	\N	\N	2026-09-16 11:08:26.04294+00	1
21b1d7ae-0dea-4a15-bc3f-b5621a3566a2	manual	2026-09-16 22:26:18.968081+00	20260916230000_endorsement_coverage_cancellation	\N	\N	2026-09-16 22:26:18.968081+00	1
d3ff1d63-b1c7-4968-aa90-522ebe81e568	manual	2026-09-16 23:07:37.109625+00	20260916234500_vehicle_product_variant	\N	\N	2026-09-16 23:07:37.109625+00	1
dc77e7df-af30-4825-b6c0-c179682f419e	manual	2026-09-17 20:03:12.352967+00	20260917200247_variant_gross_target_coverage	\N	\N	2026-09-17 20:03:12.352967+00	1
bb129720-dc81-44a7-bec2-08d8c12deb4b	19d8e5b7da086ec355ef82ed21f8e8636c28d67008227a56a6eac88726779d69	2026-09-17 20:31:01.109922+00	20260917203000_seats_based_value_threshold	\N	\N	2026-09-17 20:31:01.059797+00	1
0d9925de-1fa2-4376-a62e-54eec372cfe2	cd5863c519ec4a42d854ce261c97b5b80ae736f1463a06a0af7c93c6e90c4f9b	2026-09-17 21:30:53.129314+00	20260917213100_application_status_under_review	\N	\N	2026-09-17 21:30:53.085381+00	1
d151eba3-d569-40e1-bcd6-4812c0071af1	manual	2026-09-17 22:26:09.88794+00	20260917222542_agent_payable_aging	\N	\N	2026-09-17 22:26:09.88794+00	1
044d0edc-2a95-4127-9643-ea5ab72c1b48	manual	2026-09-17 23:01:38.37347+00	20260917230114_variant_minimum_deductible_amount	\N	\N	2026-09-17 23:01:38.37347+00	1
825ae79f-01cd-456c-96e3-b6cff204e36f	manual	2026-09-18 00:23:26.256478+00	20260918002302_vehicle_estimated_value_endorsement_type	\N	\N	2026-09-18 00:23:26.256478+00	1
508e4b75-b472-40f7-b71b-dba6f50bbb88	manual	2026-09-18 01:06:29.276444+00	20260918005949_vehicle_engine_number_nullable	\N	\N	2026-09-18 01:06:29.276444+00	1
af4104e3-20a1-4114-b363-9feafeb3c959	manual	2026-09-18 01:08:29.014729+00	20260918010817_vehicle_plate_number_unique	\N	\N	2026-09-18 01:08:29.014729+00	1
588b409a-893d-4d4d-a232-6342d1b23c85	manual	2026-09-18 04:33:35.015902+00	20260918043400_policyvehicle_engine_number_nullable	\N	\N	2026-09-18 04:33:35.015902+00	1
1a7f1216-60a6-4ac2-a600-b07952475a25	manual	2026-09-18 04:44:45.145578+00	20260918050000_customer_mobile_number_unique	\N	\N	2026-09-18 04:44:45.145578+00	1
\.


--
-- Name: Address Address_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Address"
    ADD CONSTRAINT "Address_pkey" PRIMARY KEY (id);


--
-- Name: AgentFlatTierPricing AgentFlatTierPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentFlatTierPricing"
    ADD CONSTRAINT "AgentFlatTierPricing_pkey" PRIMARY KEY (id);


--
-- Name: AgentNetrate AgentNetrate_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentNetrate"
    ADD CONSTRAINT "AgentNetrate_pkey" PRIMARY KEY (id);


--
-- Name: AgentPayableTransaction AgentPayableTransaction_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentPayableTransaction"
    ADD CONSTRAINT "AgentPayableTransaction_pkey" PRIMARY KEY (id);


--
-- Name: AgentSeatsBasedPricing AgentSeatsBasedPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentSeatsBasedPricing"
    ADD CONSTRAINT "AgentSeatsBasedPricing_pkey" PRIMARY KEY (id);


--
-- Name: AgentSeatsTierPricing AgentSeatsTierPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentSeatsTierPricing"
    ADD CONSTRAINT "AgentSeatsTierPricing_pkey" PRIMARY KEY (id);


--
-- Name: AgentValuePercentageTier AgentValuePercentageTier_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentValuePercentageTier"
    ADD CONSTRAINT "AgentValuePercentageTier_pkey" PRIMARY KEY (id);


--
-- Name: Agent Agent_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Agent"
    ADD CONSTRAINT "Agent_pkey" PRIMARY KEY (id);


--
-- Name: ApplicationCoverage ApplicationCoverage_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ApplicationCoverage"
    ADD CONSTRAINT "ApplicationCoverage_pkey" PRIMARY KEY (id);


--
-- Name: ApprovalHistory ApprovalHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ApprovalHistory"
    ADD CONSTRAINT "ApprovalHistory_pkey" PRIMARY KEY (id);


--
-- Name: AuthorizedPaymentMethod AuthorizedPaymentMethod_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AuthorizedPaymentMethod"
    ADD CONSTRAINT "AuthorizedPaymentMethod_pkey" PRIMARY KEY (id);


--
-- Name: CancellationHistory CancellationHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CancellationHistory"
    ADD CONSTRAINT "CancellationHistory_pkey" PRIMARY KEY (id);


--
-- Name: CompanyAgent CompanyAgent_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CompanyAgent"
    ADD CONSTRAINT "CompanyAgent_pkey" PRIMARY KEY (id);


--
-- Name: Company Company_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Company"
    ADD CONSTRAINT "Company_pkey" PRIMARY KEY (id);


--
-- Name: CoverageAllowablePeriod CoverageAllowablePeriod_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoverageAllowablePeriod"
    ADD CONSTRAINT "CoverageAllowablePeriod_pkey" PRIMARY KEY (id);


--
-- Name: CoveragePercentageBasedPricing CoveragePercentageBasedPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoveragePercentageBasedPricing"
    ADD CONSTRAINT "CoveragePercentageBasedPricing_pkey" PRIMARY KEY (id);


--
-- Name: CoverageSeatsBasedPricing CoverageSeatsBasedPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoverageSeatsBasedPricing"
    ADD CONSTRAINT "CoverageSeatsBasedPricing_pkey" PRIMARY KEY (id);


--
-- Name: CoverageSeatsTierPricing CoverageSeatsTierPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoverageSeatsTierPricing"
    ADD CONSTRAINT "CoverageSeatsTierPricing_pkey" PRIMARY KEY (id);


--
-- Name: CoverageTierBasedPricing CoverageTierBasedPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoverageTierBasedPricing"
    ADD CONSTRAINT "CoverageTierBasedPricing_pkey" PRIMARY KEY (id);


--
-- Name: CoverageValuePercentageTier CoverageValuePercentageTier_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoverageValuePercentageTier"
    ADD CONSTRAINT "CoverageValuePercentageTier_pkey" PRIMARY KEY (id);


--
-- Name: CustomerAgent CustomerAgent_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CustomerAgent"
    ADD CONSTRAINT "CustomerAgent_pkey" PRIMARY KEY (id);


--
-- Name: Customer Customer_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_pkey" PRIMARY KEY (id);


--
-- Name: EndorsementApprovalHistory EndorsementApprovalHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementApprovalHistory"
    ADD CONSTRAINT "EndorsementApprovalHistory_pkey" PRIMARY KEY (id);


--
-- Name: EndorsementChange EndorsementChange_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementChange"
    ADD CONSTRAINT "EndorsementChange_pkey" PRIMARY KEY (id);


--
-- Name: EndorsementRequest EndorsementRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementRequest"
    ADD CONSTRAINT "EndorsementRequest_pkey" PRIMARY KEY (id);


--
-- Name: InLeaseBacklog InLeaseBacklog_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."InLeaseBacklog"
    ADD CONSTRAINT "InLeaseBacklog_pkey" PRIMARY KEY (id);


--
-- Name: InsuranceClass InsuranceClass_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."InsuranceClass"
    ADD CONSTRAINT "InsuranceClass_pkey" PRIMARY KEY (id);


--
-- Name: PartyAddress PartyAddress_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PartyAddress"
    ADD CONSTRAINT "PartyAddress_pkey" PRIMARY KEY (id);


--
-- Name: PartyVehicle PartyVehicle_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PartyVehicle"
    ADD CONSTRAINT "PartyVehicle_pkey" PRIMARY KEY (id);


--
-- Name: Permission Permission_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Permission"
    ADD CONSTRAINT "Permission_pkey" PRIMARY KEY (id);


--
-- Name: PolicyAddress PolicyAddress_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyAddress"
    ADD CONSTRAINT "PolicyAddress_pkey" PRIMARY KEY (id);


--
-- Name: PolicyApplicationAddress PolicyApplicationAddress_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationAddress"
    ADD CONSTRAINT "PolicyApplicationAddress_pkey" PRIMARY KEY (id);


--
-- Name: PolicyApplicationChange PolicyApplicationChange_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationChange"
    ADD CONSTRAINT "PolicyApplicationChange_pkey" PRIMARY KEY (id);


--
-- Name: PolicyApplicationVehicle PolicyApplicationVehicle_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationVehicle"
    ADD CONSTRAINT "PolicyApplicationVehicle_pkey" PRIMARY KEY (id);


--
-- Name: PolicyApplication PolicyApplication_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplication"
    ADD CONSTRAINT "PolicyApplication_pkey" PRIMARY KEY (id);


--
-- Name: PolicyCoverage PolicyCoverage_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyCoverage"
    ADD CONSTRAINT "PolicyCoverage_pkey" PRIMARY KEY (id);


--
-- Name: PolicyQuotationAddress PolicyQuotationAddress_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotationAddress"
    ADD CONSTRAINT "PolicyQuotationAddress_pkey" PRIMARY KEY (id);


--
-- Name: PolicyQuotationVehicle PolicyQuotationVehicle_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotationVehicle"
    ADD CONSTRAINT "PolicyQuotationVehicle_pkey" PRIMARY KEY (id);


--
-- Name: PolicyQuotation PolicyQuotation_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotation"
    ADD CONSTRAINT "PolicyQuotation_pkey" PRIMARY KEY (id);


--
-- Name: PolicyVehicle PolicyVehicle_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyVehicle"
    ADD CONSTRAINT "PolicyVehicle_pkey" PRIMARY KEY (id);


--
-- Name: Policy Policy_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Policy"
    ADD CONSTRAINT "Policy_pkey" PRIMARY KEY (id);


--
-- Name: ProductCoverage ProductCoverage_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ProductCoverage"
    ADD CONSTRAINT "ProductCoverage_pkey" PRIMARY KEY (id);


--
-- Name: ProductVariant ProductVariant_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_pkey" PRIMARY KEY (id);


--
-- Name: QuotationCoverage QuotationCoverage_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."QuotationCoverage"
    ADD CONSTRAINT "QuotationCoverage_pkey" PRIMARY KEY (id);


--
-- Name: RolePermission RolePermission_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."RolePermission"
    ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY (id);


--
-- Name: Role Role_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Role"
    ADD CONSTRAINT "Role_pkey" PRIMARY KEY (id);


--
-- Name: UserPermission UserPermission_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."UserPermission"
    ADD CONSTRAINT "UserPermission_pkey" PRIMARY KEY (id);


--
-- Name: UserRole UserRole_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: Vehicle Vehicle_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Vehicle"
    ADD CONSTRAINT "Vehicle_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: AgentFlatTierPricing_agent_id_coverage_allowable_period_id__key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "AgentFlatTierPricing_agent_id_coverage_allowable_period_id__key" ON public."AgentFlatTierPricing" USING btree (agent_id, coverage_allowable_period_id, coverage_amount);


--
-- Name: AgentFlatTierPricing_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "AgentFlatTierPricing_agent_id_idx" ON public."AgentFlatTierPricing" USING btree (agent_id);


--
-- Name: AgentNetrate_agent_id_coverage_allowable_period_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "AgentNetrate_agent_id_coverage_allowable_period_id_key" ON public."AgentNetrate" USING btree (agent_id, coverage_allowable_period_id);


--
-- Name: AgentNetrate_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "AgentNetrate_agent_id_idx" ON public."AgentNetrate" USING btree (agent_id);


--
-- Name: AgentPayableTransaction_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "AgentPayableTransaction_agent_id_idx" ON public."AgentPayableTransaction" USING btree (agent_id);


--
-- Name: AgentPayableTransaction_due_date_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "AgentPayableTransaction_due_date_idx" ON public."AgentPayableTransaction" USING btree (due_date);


--
-- Name: AgentPayableTransaction_policy_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "AgentPayableTransaction_policy_id_idx" ON public."AgentPayableTransaction" USING btree (policy_id);


--
-- Name: AgentSeatsBasedPricing_agent_id_coverage_allowable_period_i_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "AgentSeatsBasedPricing_agent_id_coverage_allowable_period_i_key" ON public."AgentSeatsBasedPricing" USING btree (agent_id, coverage_allowable_period_id);


--
-- Name: AgentSeatsBasedPricing_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "AgentSeatsBasedPricing_agent_id_idx" ON public."AgentSeatsBasedPricing" USING btree (agent_id);


--
-- Name: AgentSeatsTierPricing_agent_id_coverage_allowable_period_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "AgentSeatsTierPricing_agent_id_coverage_allowable_period_id_key" ON public."AgentSeatsTierPricing" USING btree (agent_id, coverage_allowable_period_id, insured_amount_per_occupant);


--
-- Name: AgentSeatsTierPricing_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "AgentSeatsTierPricing_agent_id_idx" ON public."AgentSeatsTierPricing" USING btree (agent_id);


--
-- Name: AgentValuePercentageTier_agent_id_coverage_allowable_period_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "AgentValuePercentageTier_agent_id_coverage_allowable_period_key" ON public."AgentValuePercentageTier" USING btree (agent_id, coverage_allowable_period_id, min_value);


--
-- Name: AgentValuePercentageTier_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "AgentValuePercentageTier_agent_id_idx" ON public."AgentValuePercentageTier" USING btree (agent_id);


--
-- Name: Agent_agent_code_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Agent_agent_code_key" ON public."Agent" USING btree (agent_code);


--
-- Name: Agent_company_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "Agent_company_id_idx" ON public."Agent" USING btree (company_id);


--
-- Name: Agent_linked_company_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "Agent_linked_company_id_idx" ON public."Agent" USING btree (linked_company_id);


--
-- Name: Agent_work_email_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Agent_work_email_key" ON public."Agent" USING btree (work_email);


--
-- Name: ApplicationCoverage_application_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "ApplicationCoverage_application_id_idx" ON public."ApplicationCoverage" USING btree (application_id);


--
-- Name: ApplicationCoverage_policy_application_vehicle_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "ApplicationCoverage_policy_application_vehicle_id_idx" ON public."ApplicationCoverage" USING btree (policy_application_vehicle_id);


--
-- Name: ApprovalHistory_application_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "ApprovalHistory_application_id_idx" ON public."ApprovalHistory" USING btree (application_id);


--
-- Name: AuthorizedPaymentMethod_name_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "AuthorizedPaymentMethod_name_key" ON public."AuthorizedPaymentMethod" USING btree (name);


--
-- Name: CancellationHistory_policy_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "CancellationHistory_policy_id_idx" ON public."CancellationHistory" USING btree (policy_id);


--
-- Name: CompanyAgent_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "CompanyAgent_agent_id_idx" ON public."CompanyAgent" USING btree (agent_id);


--
-- Name: CompanyAgent_company_id_agent_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "CompanyAgent_company_id_agent_id_key" ON public."CompanyAgent" USING btree (company_id, agent_id);


--
-- Name: Company_company_code_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Company_company_code_key" ON public."Company" USING btree (company_code);


--
-- Name: Company_email_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Company_email_key" ON public."Company" USING btree (email);


--
-- Name: CoverageAllowablePeriod_coverage_id_coverage_in_days_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "CoverageAllowablePeriod_coverage_id_coverage_in_days_key" ON public."CoverageAllowablePeriod" USING btree (coverage_id, coverage_in_days);


--
-- Name: CoverageAllowablePeriod_coverage_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "CoverageAllowablePeriod_coverage_id_idx" ON public."CoverageAllowablePeriod" USING btree (coverage_id);


--
-- Name: CoveragePercentageBasedPricing_coverage_allowable_period_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "CoveragePercentageBasedPricing_coverage_allowable_period_id_key" ON public."CoveragePercentageBasedPricing" USING btree (coverage_allowable_period_id);


--
-- Name: CoverageSeatsBasedPricing_coverage_allowable_period_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "CoverageSeatsBasedPricing_coverage_allowable_period_id_key" ON public."CoverageSeatsBasedPricing" USING btree (coverage_allowable_period_id);


--
-- Name: CoverageSeatsTierPricing_coverage_allowable_period_id_insur_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "CoverageSeatsTierPricing_coverage_allowable_period_id_insur_key" ON public."CoverageSeatsTierPricing" USING btree (coverage_allowable_period_id, insured_amount_per_occupant);


--
-- Name: CoverageTierBasedPricing_coverage_allowable_period_id_cover_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "CoverageTierBasedPricing_coverage_allowable_period_id_cover_key" ON public."CoverageTierBasedPricing" USING btree (coverage_allowable_period_id, coverage_amount);


--
-- Name: CoverageValuePercentageTier_coverage_allowable_period_id_mi_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "CoverageValuePercentageTier_coverage_allowable_period_id_mi_key" ON public."CoverageValuePercentageTier" USING btree (coverage_allowable_period_id, min_value);


--
-- Name: CustomerAgent_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "CustomerAgent_agent_id_idx" ON public."CustomerAgent" USING btree (agent_id);


--
-- Name: CustomerAgent_customer_id_agent_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "CustomerAgent_customer_id_agent_id_key" ON public."CustomerAgent" USING btree (customer_id, agent_id);


--
-- Name: Customer_email_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Customer_email_key" ON public."Customer" USING btree (email);


--
-- Name: Customer_mobile_number_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Customer_mobile_number_key" ON public."Customer" USING btree (mobile_number);


--
-- Name: EndorsementApprovalHistory_endorsement_request_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "EndorsementApprovalHistory_endorsement_request_id_idx" ON public."EndorsementApprovalHistory" USING btree (endorsement_request_id);


--
-- Name: EndorsementChange_endorsement_request_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "EndorsementChange_endorsement_request_id_idx" ON public."EndorsementChange" USING btree (endorsement_request_id);


--
-- Name: EndorsementRequest_endorsement_number_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "EndorsementRequest_endorsement_number_key" ON public."EndorsementRequest" USING btree (endorsement_number);


--
-- Name: EndorsementRequest_policy_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "EndorsementRequest_policy_id_idx" ON public."EndorsementRequest" USING btree (policy_id);


--
-- Name: EndorsementRequest_policy_id_sequence_no_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "EndorsementRequest_policy_id_sequence_no_key" ON public."EndorsementRequest" USING btree (policy_id, sequence_no);


--
-- Name: EndorsementRequest_status_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "EndorsementRequest_status_idx" ON public."EndorsementRequest" USING btree (status);


--
-- Name: InLeaseBacklog_accomplished_by_user_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "InLeaseBacklog_accomplished_by_user_id_idx" ON public."InLeaseBacklog" USING btree (accomplished_by_user_id);


--
-- Name: InLeaseBacklog_endorsement_request_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "InLeaseBacklog_endorsement_request_id_idx" ON public."InLeaseBacklog" USING btree (endorsement_request_id);


--
-- Name: InLeaseBacklog_policy_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "InLeaseBacklog_policy_id_idx" ON public."InLeaseBacklog" USING btree (policy_id);


--
-- Name: InsuranceClass_class_name_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "InsuranceClass_class_name_key" ON public."InsuranceClass" USING btree (class_name);


--
-- Name: PartyAddress_company_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PartyAddress_company_id_idx" ON public."PartyAddress" USING btree (company_id);


--
-- Name: PartyAddress_customer_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PartyAddress_customer_id_idx" ON public."PartyAddress" USING btree (customer_id);


--
-- Name: PartyVehicle_company_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PartyVehicle_company_id_idx" ON public."PartyVehicle" USING btree (company_id);


--
-- Name: PartyVehicle_customer_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PartyVehicle_customer_id_idx" ON public."PartyVehicle" USING btree (customer_id);


--
-- Name: Permission_permission_code_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Permission_permission_code_key" ON public."Permission" USING btree (permission_code);


--
-- Name: PolicyAddress_policy_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyAddress_policy_id_idx" ON public."PolicyAddress" USING btree (policy_id);


--
-- Name: PolicyAddress_policy_id_role_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "PolicyAddress_policy_id_role_key" ON public."PolicyAddress" USING btree (policy_id, role);


--
-- Name: PolicyApplicationAddress_policy_application_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyApplicationAddress_policy_application_id_idx" ON public."PolicyApplicationAddress" USING btree (policy_application_id);


--
-- Name: PolicyApplicationAddress_policy_application_id_role_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "PolicyApplicationAddress_policy_application_id_role_key" ON public."PolicyApplicationAddress" USING btree (policy_application_id, role);


--
-- Name: PolicyApplicationChange_policy_application_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyApplicationChange_policy_application_id_idx" ON public."PolicyApplicationChange" USING btree (policy_application_id);


--
-- Name: PolicyApplicationVehicle_policy_application_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyApplicationVehicle_policy_application_id_idx" ON public."PolicyApplicationVehicle" USING btree (policy_application_id);


--
-- Name: PolicyApplication_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyApplication_agent_id_idx" ON public."PolicyApplication" USING btree (agent_id);


--
-- Name: PolicyApplication_application_number_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "PolicyApplication_application_number_key" ON public."PolicyApplication" USING btree (application_number);


--
-- Name: PolicyApplication_company_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyApplication_company_id_idx" ON public."PolicyApplication" USING btree (company_id);


--
-- Name: PolicyApplication_customer_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyApplication_customer_id_idx" ON public."PolicyApplication" USING btree (customer_id);


--
-- Name: PolicyApplication_source_quotation_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "PolicyApplication_source_quotation_id_key" ON public."PolicyApplication" USING btree (source_quotation_id);


--
-- Name: PolicyApplication_status_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyApplication_status_idx" ON public."PolicyApplication" USING btree (status);


--
-- Name: PolicyCoverage_policy_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyCoverage_policy_id_idx" ON public."PolicyCoverage" USING btree (policy_id);


--
-- Name: PolicyCoverage_removed_at_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyCoverage_removed_at_idx" ON public."PolicyCoverage" USING btree (removed_at);


--
-- Name: PolicyQuotationAddress_policy_quotation_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyQuotationAddress_policy_quotation_id_idx" ON public."PolicyQuotationAddress" USING btree (policy_quotation_id);


--
-- Name: PolicyQuotationAddress_policy_quotation_id_role_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "PolicyQuotationAddress_policy_quotation_id_role_key" ON public."PolicyQuotationAddress" USING btree (policy_quotation_id, role);


--
-- Name: PolicyQuotationVehicle_policy_quotation_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyQuotationVehicle_policy_quotation_id_idx" ON public."PolicyQuotationVehicle" USING btree (policy_quotation_id);


--
-- Name: PolicyQuotation_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyQuotation_agent_id_idx" ON public."PolicyQuotation" USING btree (agent_id);


--
-- Name: PolicyQuotation_company_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyQuotation_company_id_idx" ON public."PolicyQuotation" USING btree (company_id);


--
-- Name: PolicyQuotation_customer_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyQuotation_customer_id_idx" ON public."PolicyQuotation" USING btree (customer_id);


--
-- Name: PolicyQuotation_quotation_number_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "PolicyQuotation_quotation_number_key" ON public."PolicyQuotation" USING btree (quotation_number);


--
-- Name: PolicyVehicle_policy_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "PolicyVehicle_policy_id_idx" ON public."PolicyVehicle" USING btree (policy_id);


--
-- Name: Policy_agent_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "Policy_agent_id_idx" ON public."Policy" USING btree (agent_id);


--
-- Name: Policy_application_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Policy_application_id_key" ON public."Policy" USING btree (application_id);


--
-- Name: Policy_company_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "Policy_company_id_idx" ON public."Policy" USING btree (company_id);


--
-- Name: Policy_customer_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "Policy_customer_id_idx" ON public."Policy" USING btree (customer_id);


--
-- Name: Policy_expiry_date_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "Policy_expiry_date_idx" ON public."Policy" USING btree (expiry_date);


--
-- Name: Policy_policy_number_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Policy_policy_number_key" ON public."Policy" USING btree (policy_number);


--
-- Name: Policy_policy_status_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "Policy_policy_status_idx" ON public."Policy" USING btree (policy_status);


--
-- Name: ProductCoverage_coverage_code_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "ProductCoverage_coverage_code_key" ON public."ProductCoverage" USING btree (coverage_code);


--
-- Name: ProductCoverage_product_variant_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "ProductCoverage_product_variant_id_idx" ON public."ProductCoverage" USING btree (product_variant_id);


--
-- Name: ProductVariant_insurance_class_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "ProductVariant_insurance_class_id_idx" ON public."ProductVariant" USING btree (insurance_class_id);


--
-- Name: ProductVariant_variant_code_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "ProductVariant_variant_code_key" ON public."ProductVariant" USING btree (variant_code);


--
-- Name: QuotationCoverage_policy_quotation_vehicle_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "QuotationCoverage_policy_quotation_vehicle_id_idx" ON public."QuotationCoverage" USING btree (policy_quotation_vehicle_id);


--
-- Name: QuotationCoverage_quotation_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "QuotationCoverage_quotation_id_idx" ON public."QuotationCoverage" USING btree (quotation_id);


--
-- Name: RolePermission_role_id_permission_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "RolePermission_role_id_permission_id_key" ON public."RolePermission" USING btree (role_id, permission_id);


--
-- Name: Role_role_name_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Role_role_name_key" ON public."Role" USING btree (role_name);


--
-- Name: UserPermission_user_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "UserPermission_user_id_idx" ON public."UserPermission" USING btree (user_id);


--
-- Name: UserPermission_user_id_permission_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "UserPermission_user_id_permission_id_key" ON public."UserPermission" USING btree (user_id, permission_id);


--
-- Name: UserRole_user_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "UserRole_user_id_idx" ON public."UserRole" USING btree (user_id);


--
-- Name: UserRole_user_id_role_id_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "UserRole_user_id_role_id_key" ON public."UserRole" USING btree (user_id, role_id);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_invite_token_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "User_invite_token_key" ON public."User" USING btree (invite_token);


--
-- Name: User_status_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "User_status_idx" ON public."User" USING btree (status);


--
-- Name: Vehicle_chassis_number_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Vehicle_chassis_number_key" ON public."Vehicle" USING btree (chassis_number);


--
-- Name: Vehicle_engine_number_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Vehicle_engine_number_key" ON public."Vehicle" USING btree (engine_number);


--
-- Name: Vehicle_mv_file_no_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Vehicle_mv_file_no_key" ON public."Vehicle" USING btree (mv_file_no);


--
-- Name: Vehicle_plate_number_key; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE UNIQUE INDEX "Vehicle_plate_number_key" ON public."Vehicle" USING btree (plate_number);


--
-- Name: Vehicle_product_variant_id_idx; Type: INDEX; Schema: public; Owner: policyapp
--

CREATE INDEX "Vehicle_product_variant_id_idx" ON public."Vehicle" USING btree (product_variant_id);


--
-- Name: AgentFlatTierPricing AgentFlatTierPricing_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentFlatTierPricing"
    ADD CONSTRAINT "AgentFlatTierPricing_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AgentFlatTierPricing AgentFlatTierPricing_coverage_allowable_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentFlatTierPricing"
    ADD CONSTRAINT "AgentFlatTierPricing_coverage_allowable_period_id_fkey" FOREIGN KEY (coverage_allowable_period_id) REFERENCES public."CoverageAllowablePeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AgentNetrate AgentNetrate_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentNetrate"
    ADD CONSTRAINT "AgentNetrate_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AgentNetrate AgentNetrate_coverage_allowable_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentNetrate"
    ADD CONSTRAINT "AgentNetrate_coverage_allowable_period_id_fkey" FOREIGN KEY (coverage_allowable_period_id) REFERENCES public."CoverageAllowablePeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AgentPayableTransaction AgentPayableTransaction_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentPayableTransaction"
    ADD CONSTRAINT "AgentPayableTransaction_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AgentPayableTransaction AgentPayableTransaction_applies_to_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentPayableTransaction"
    ADD CONSTRAINT "AgentPayableTransaction_applies_to_transaction_id_fkey" FOREIGN KEY (applies_to_transaction_id) REFERENCES public."AgentPayableTransaction"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AgentPayableTransaction AgentPayableTransaction_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentPayableTransaction"
    ADD CONSTRAINT "AgentPayableTransaction_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AgentPayableTransaction AgentPayableTransaction_endorsement_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentPayableTransaction"
    ADD CONSTRAINT "AgentPayableTransaction_endorsement_request_id_fkey" FOREIGN KEY (endorsement_request_id) REFERENCES public."EndorsementRequest"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AgentPayableTransaction AgentPayableTransaction_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentPayableTransaction"
    ADD CONSTRAINT "AgentPayableTransaction_policy_id_fkey" FOREIGN KEY (policy_id) REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AgentSeatsBasedPricing AgentSeatsBasedPricing_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentSeatsBasedPricing"
    ADD CONSTRAINT "AgentSeatsBasedPricing_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AgentSeatsBasedPricing AgentSeatsBasedPricing_coverage_allowable_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentSeatsBasedPricing"
    ADD CONSTRAINT "AgentSeatsBasedPricing_coverage_allowable_period_id_fkey" FOREIGN KEY (coverage_allowable_period_id) REFERENCES public."CoverageAllowablePeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AgentSeatsTierPricing AgentSeatsTierPricing_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentSeatsTierPricing"
    ADD CONSTRAINT "AgentSeatsTierPricing_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AgentSeatsTierPricing AgentSeatsTierPricing_coverage_allowable_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentSeatsTierPricing"
    ADD CONSTRAINT "AgentSeatsTierPricing_coverage_allowable_period_id_fkey" FOREIGN KEY (coverage_allowable_period_id) REFERENCES public."CoverageAllowablePeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AgentValuePercentageTier AgentValuePercentageTier_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentValuePercentageTier"
    ADD CONSTRAINT "AgentValuePercentageTier_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AgentValuePercentageTier AgentValuePercentageTier_coverage_allowable_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."AgentValuePercentageTier"
    ADD CONSTRAINT "AgentValuePercentageTier_coverage_allowable_period_id_fkey" FOREIGN KEY (coverage_allowable_period_id) REFERENCES public."CoverageAllowablePeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Agent Agent_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Agent"
    ADD CONSTRAINT "Agent_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Agent Agent_linked_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Agent"
    ADD CONSTRAINT "Agent_linked_company_id_fkey" FOREIGN KEY (linked_company_id) REFERENCES public."Company"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ApplicationCoverage ApplicationCoverage_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ApplicationCoverage"
    ADD CONSTRAINT "ApplicationCoverage_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public."PolicyApplication"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ApplicationCoverage ApplicationCoverage_coverage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ApplicationCoverage"
    ADD CONSTRAINT "ApplicationCoverage_coverage_id_fkey" FOREIGN KEY (coverage_id) REFERENCES public."ProductCoverage"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ApplicationCoverage ApplicationCoverage_policy_application_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ApplicationCoverage"
    ADD CONSTRAINT "ApplicationCoverage_policy_application_vehicle_id_fkey" FOREIGN KEY (policy_application_vehicle_id) REFERENCES public."PolicyApplicationVehicle"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ApprovalHistory ApprovalHistory_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ApprovalHistory"
    ADD CONSTRAINT "ApprovalHistory_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public."PolicyApplication"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ApprovalHistory ApprovalHistory_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ApprovalHistory"
    ADD CONSTRAINT "ApprovalHistory_approver_id_fkey" FOREIGN KEY (approver_id) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CancellationHistory CancellationHistory_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CancellationHistory"
    ADD CONSTRAINT "CancellationHistory_approver_id_fkey" FOREIGN KEY (approver_id) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CancellationHistory CancellationHistory_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CancellationHistory"
    ADD CONSTRAINT "CancellationHistory_policy_id_fkey" FOREIGN KEY (policy_id) REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CompanyAgent CompanyAgent_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CompanyAgent"
    ADD CONSTRAINT "CompanyAgent_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CompanyAgent CompanyAgent_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CompanyAgent"
    ADD CONSTRAINT "CompanyAgent_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public."Company"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CoverageAllowablePeriod CoverageAllowablePeriod_coverage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoverageAllowablePeriod"
    ADD CONSTRAINT "CoverageAllowablePeriod_coverage_id_fkey" FOREIGN KEY (coverage_id) REFERENCES public."ProductCoverage"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CoveragePercentageBasedPricing CoveragePercentageBasedPricing_coverage_allowable_period_i_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoveragePercentageBasedPricing"
    ADD CONSTRAINT "CoveragePercentageBasedPricing_coverage_allowable_period_i_fkey" FOREIGN KEY (coverage_allowable_period_id) REFERENCES public."CoverageAllowablePeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CoverageSeatsBasedPricing CoverageSeatsBasedPricing_coverage_allowable_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoverageSeatsBasedPricing"
    ADD CONSTRAINT "CoverageSeatsBasedPricing_coverage_allowable_period_id_fkey" FOREIGN KEY (coverage_allowable_period_id) REFERENCES public."CoverageAllowablePeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CoverageSeatsTierPricing CoverageSeatsTierPricing_coverage_allowable_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoverageSeatsTierPricing"
    ADD CONSTRAINT "CoverageSeatsTierPricing_coverage_allowable_period_id_fkey" FOREIGN KEY (coverage_allowable_period_id) REFERENCES public."CoverageAllowablePeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CoverageTierBasedPricing CoverageTierBasedPricing_coverage_allowable_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoverageTierBasedPricing"
    ADD CONSTRAINT "CoverageTierBasedPricing_coverage_allowable_period_id_fkey" FOREIGN KEY (coverage_allowable_period_id) REFERENCES public."CoverageAllowablePeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CoverageValuePercentageTier CoverageValuePercentageTier_coverage_allowable_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CoverageValuePercentageTier"
    ADD CONSTRAINT "CoverageValuePercentageTier_coverage_allowable_period_id_fkey" FOREIGN KEY (coverage_allowable_period_id) REFERENCES public."CoverageAllowablePeriod"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CustomerAgent CustomerAgent_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CustomerAgent"
    ADD CONSTRAINT "CustomerAgent_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CustomerAgent CustomerAgent_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."CustomerAgent"
    ADD CONSTRAINT "CustomerAgent_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Customer Customer_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public."Company"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: EndorsementApprovalHistory EndorsementApprovalHistory_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementApprovalHistory"
    ADD CONSTRAINT "EndorsementApprovalHistory_approver_id_fkey" FOREIGN KEY (approver_id) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EndorsementApprovalHistory EndorsementApprovalHistory_endorsement_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementApprovalHistory"
    ADD CONSTRAINT "EndorsementApprovalHistory_endorsement_request_id_fkey" FOREIGN KEY (endorsement_request_id) REFERENCES public."EndorsementRequest"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EndorsementChange EndorsementChange_endorsement_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementChange"
    ADD CONSTRAINT "EndorsementChange_endorsement_request_id_fkey" FOREIGN KEY (endorsement_request_id) REFERENCES public."EndorsementRequest"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: EndorsementChange EndorsementChange_policy_coverage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementChange"
    ADD CONSTRAINT "EndorsementChange_policy_coverage_id_fkey" FOREIGN KEY (policy_coverage_id) REFERENCES public."PolicyCoverage"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: EndorsementChange EndorsementChange_policy_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementChange"
    ADD CONSTRAINT "EndorsementChange_policy_vehicle_id_fkey" FOREIGN KEY (policy_vehicle_id) REFERENCES public."PolicyVehicle"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: EndorsementChange EndorsementChange_product_coverage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementChange"
    ADD CONSTRAINT "EndorsementChange_product_coverage_id_fkey" FOREIGN KEY (product_coverage_id) REFERENCES public."ProductCoverage"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: EndorsementRequest EndorsementRequest_created_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementRequest"
    ADD CONSTRAINT "EndorsementRequest_created_by_agent_id_fkey" FOREIGN KEY (created_by_agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EndorsementRequest EndorsementRequest_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementRequest"
    ADD CONSTRAINT "EndorsementRequest_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EndorsementRequest EndorsementRequest_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."EndorsementRequest"
    ADD CONSTRAINT "EndorsementRequest_policy_id_fkey" FOREIGN KEY (policy_id) REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InLeaseBacklog InLeaseBacklog_accomplished_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."InLeaseBacklog"
    ADD CONSTRAINT "InLeaseBacklog_accomplished_by_user_id_fkey" FOREIGN KEY (accomplished_by_user_id) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InLeaseBacklog InLeaseBacklog_endorsement_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."InLeaseBacklog"
    ADD CONSTRAINT "InLeaseBacklog_endorsement_request_id_fkey" FOREIGN KEY (endorsement_request_id) REFERENCES public."EndorsementRequest"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InLeaseBacklog InLeaseBacklog_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."InLeaseBacklog"
    ADD CONSTRAINT "InLeaseBacklog_policy_id_fkey" FOREIGN KEY (policy_id) REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PartyAddress PartyAddress_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PartyAddress"
    ADD CONSTRAINT "PartyAddress_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public."Address"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PartyAddress PartyAddress_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PartyAddress"
    ADD CONSTRAINT "PartyAddress_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public."Company"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartyAddress PartyAddress_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PartyAddress"
    ADD CONSTRAINT "PartyAddress_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartyVehicle PartyVehicle_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PartyVehicle"
    ADD CONSTRAINT "PartyVehicle_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public."Company"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartyVehicle PartyVehicle_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PartyVehicle"
    ADD CONSTRAINT "PartyVehicle_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartyVehicle PartyVehicle_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PartyVehicle"
    ADD CONSTRAINT "PartyVehicle_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public."Vehicle"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyAddress PolicyAddress_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyAddress"
    ADD CONSTRAINT "PolicyAddress_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public."Address"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyAddress PolicyAddress_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyAddress"
    ADD CONSTRAINT "PolicyAddress_policy_id_fkey" FOREIGN KEY (policy_id) REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyApplicationAddress PolicyApplicationAddress_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationAddress"
    ADD CONSTRAINT "PolicyApplicationAddress_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public."Address"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyApplicationAddress PolicyApplicationAddress_policy_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationAddress"
    ADD CONSTRAINT "PolicyApplicationAddress_policy_application_id_fkey" FOREIGN KEY (policy_application_id) REFERENCES public."PolicyApplication"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyApplicationChange PolicyApplicationChange_application_coverage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationChange"
    ADD CONSTRAINT "PolicyApplicationChange_application_coverage_id_fkey" FOREIGN KEY (application_coverage_id) REFERENCES public."ApplicationCoverage"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyApplicationChange PolicyApplicationChange_application_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationChange"
    ADD CONSTRAINT "PolicyApplicationChange_application_vehicle_id_fkey" FOREIGN KEY (application_vehicle_id) REFERENCES public."PolicyApplicationVehicle"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyApplicationChange PolicyApplicationChange_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationChange"
    ADD CONSTRAINT "PolicyApplicationChange_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyApplicationChange PolicyApplicationChange_policy_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationChange"
    ADD CONSTRAINT "PolicyApplicationChange_policy_application_id_fkey" FOREIGN KEY (policy_application_id) REFERENCES public."PolicyApplication"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyApplicationVehicle PolicyApplicationVehicle_policy_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationVehicle"
    ADD CONSTRAINT "PolicyApplicationVehicle_policy_application_id_fkey" FOREIGN KEY (policy_application_id) REFERENCES public."PolicyApplication"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyApplicationVehicle PolicyApplicationVehicle_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplicationVehicle"
    ADD CONSTRAINT "PolicyApplicationVehicle_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public."Vehicle"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyApplication PolicyApplication_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplication"
    ADD CONSTRAINT "PolicyApplication_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyApplication PolicyApplication_bethel_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplication"
    ADD CONSTRAINT "PolicyApplication_bethel_payment_method_id_fkey" FOREIGN KEY (bethel_payment_method_id) REFERENCES public."AuthorizedPaymentMethod"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyApplication PolicyApplication_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplication"
    ADD CONSTRAINT "PolicyApplication_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public."Company"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyApplication PolicyApplication_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplication"
    ADD CONSTRAINT "PolicyApplication_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyApplication PolicyApplication_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplication"
    ADD CONSTRAINT "PolicyApplication_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyApplication PolicyApplication_renewed_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplication"
    ADD CONSTRAINT "PolicyApplication_renewed_policy_id_fkey" FOREIGN KEY (renewed_policy_id) REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyApplication PolicyApplication_source_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyApplication"
    ADD CONSTRAINT "PolicyApplication_source_quotation_id_fkey" FOREIGN KEY (source_quotation_id) REFERENCES public."PolicyQuotation"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyCoverage PolicyCoverage_coverage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyCoverage"
    ADD CONSTRAINT "PolicyCoverage_coverage_id_fkey" FOREIGN KEY (coverage_id) REFERENCES public."ProductCoverage"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyCoverage PolicyCoverage_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyCoverage"
    ADD CONSTRAINT "PolicyCoverage_policy_id_fkey" FOREIGN KEY (policy_id) REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyQuotationAddress PolicyQuotationAddress_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotationAddress"
    ADD CONSTRAINT "PolicyQuotationAddress_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public."Address"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyQuotationAddress PolicyQuotationAddress_policy_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotationAddress"
    ADD CONSTRAINT "PolicyQuotationAddress_policy_quotation_id_fkey" FOREIGN KEY (policy_quotation_id) REFERENCES public."PolicyQuotation"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyQuotationVehicle PolicyQuotationVehicle_policy_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotationVehicle"
    ADD CONSTRAINT "PolicyQuotationVehicle_policy_quotation_id_fkey" FOREIGN KEY (policy_quotation_id) REFERENCES public."PolicyQuotation"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyQuotationVehicle PolicyQuotationVehicle_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotationVehicle"
    ADD CONSTRAINT "PolicyQuotationVehicle_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public."Vehicle"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyQuotation PolicyQuotation_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotation"
    ADD CONSTRAINT "PolicyQuotation_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyQuotation PolicyQuotation_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotation"
    ADD CONSTRAINT "PolicyQuotation_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public."Company"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyQuotation PolicyQuotation_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotation"
    ADD CONSTRAINT "PolicyQuotation_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyQuotation PolicyQuotation_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotation"
    ADD CONSTRAINT "PolicyQuotation_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyQuotation PolicyQuotation_renewed_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyQuotation"
    ADD CONSTRAINT "PolicyQuotation_renewed_policy_id_fkey" FOREIGN KEY (renewed_policy_id) REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PolicyVehicle PolicyVehicle_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyVehicle"
    ADD CONSTRAINT "PolicyVehicle_policy_id_fkey" FOREIGN KEY (policy_id) REFERENCES public."Policy"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PolicyVehicle PolicyVehicle_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."PolicyVehicle"
    ADD CONSTRAINT "PolicyVehicle_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public."Vehicle"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Policy Policy_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Policy"
    ADD CONSTRAINT "Policy_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Policy Policy_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Policy"
    ADD CONSTRAINT "Policy_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public."PolicyApplication"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Policy Policy_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Policy"
    ADD CONSTRAINT "Policy_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public."Company"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Policy Policy_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Policy"
    ADD CONSTRAINT "Policy_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Policy Policy_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Policy"
    ADD CONSTRAINT "Policy_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductCoverage ProductCoverage_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ProductCoverage"
    ADD CONSTRAINT "ProductCoverage_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductVariant ProductVariant_gross_target_coverage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_gross_target_coverage_id_fkey" FOREIGN KEY (gross_target_coverage_id) REFERENCES public."ProductCoverage"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductVariant ProductVariant_insurance_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_insurance_class_id_fkey" FOREIGN KEY (insurance_class_id) REFERENCES public."InsuranceClass"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: QuotationCoverage QuotationCoverage_coverage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."QuotationCoverage"
    ADD CONSTRAINT "QuotationCoverage_coverage_id_fkey" FOREIGN KEY (coverage_id) REFERENCES public."ProductCoverage"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: QuotationCoverage QuotationCoverage_policy_quotation_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."QuotationCoverage"
    ADD CONSTRAINT "QuotationCoverage_policy_quotation_vehicle_id_fkey" FOREIGN KEY (policy_quotation_vehicle_id) REFERENCES public."PolicyQuotationVehicle"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: QuotationCoverage QuotationCoverage_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."QuotationCoverage"
    ADD CONSTRAINT "QuotationCoverage_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES public."PolicyQuotation"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RolePermission RolePermission_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."RolePermission"
    ADD CONSTRAINT "RolePermission_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES public."Permission"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RolePermission RolePermission_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."RolePermission"
    ADD CONSTRAINT "RolePermission_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UserPermission UserPermission_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."UserPermission"
    ADD CONSTRAINT "UserPermission_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES public."Permission"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UserPermission UserPermission_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."UserPermission"
    ADD CONSTRAINT "UserPermission_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UserRole UserRole_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UserRole UserRole_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: User User_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public."Agent"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: User User_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Vehicle Vehicle_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: policyapp
--

ALTER TABLE ONLY public."Vehicle"
    ADD CONSTRAINT "Vehicle_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict 4Uibl9sHBm8Pl2K48mTnIElMdgKRd1duzS3PmrgrlpbP3ghLkuSUfBZ1bmXkWTF

