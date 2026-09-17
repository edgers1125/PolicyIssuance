-- Whether a coverage's own premium is folded into the Miscellaneous charge
-- (instead of the Premium total) when computing an application's/quotation's
-- charges — see lib/coveragePricing.js's resolveCoverageRows.
ALTER TABLE "ProductCoverage" ADD COLUMN "is_misc" BOOLEAN NOT NULL DEFAULT false;

-- Frozen at approval time off the source PolicyApplication's own
-- renewed_policy relation — feeds the "Renewing/Replacing:" line on the
-- issued policy PDF (see pdf/policyPdf.js).
ALTER TABLE "Policy" ADD COLUMN "renewed_policy_number_snapshot" VARCHAR(50);
