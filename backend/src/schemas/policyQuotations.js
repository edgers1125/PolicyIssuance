const { z } = require("zod");
const { requiredString } = require("./common");
const {
  addressInputSchema,
  vehicleInputSchema,
  coverageSelectionSchema,
  refineWholeDayPeriod,
  wholeDayPeriodRefinement,
  refineExactlyOneParty,
  exactlyOnePartyRefinement,
} = require("./policyIntakeShared");

// Identical intake shape to createApplicationSchema (same customer/vehicle/
// coverage inputs, same coverage-period rules) minus every payment field —
// a quotation has no payment method yet, nothing is being paid for.
const createQuotationSchema = z
  .object({
    customer_id: z.string().optional(),
    company_id: z.string().optional(),
    product_variant_id: requiredString("product_variant_id"),
    coverage_start_at: z.coerce.date({ error: "coverage_start_at is required and must be a valid date" }),
    coverage_end_at: z.coerce.date({ error: "coverage_end_at is required and must be a valid date" }),
    coverages: z.array(coverageSelectionSchema).min(1, "At least one coverage must be selected"),
    vehicles: z.array(vehicleInputSchema).optional(),
    risk_address: addressInputSchema.optional(),
    insured_address: addressInputSchema.optional(),
    remarks: z.string().optional(),
    misc: z.coerce.number().optional(),
    send_policy_to_email: z.boolean().optional(),
  })
  .refine(refineExactlyOneParty, exactlyOnePartyRefinement)
  .refine(refineWholeDayPeriod, wholeDayPeriodRefinement);

// Pagination for GET /policy-quotations — capped page_size so a caller can't
// force one giant unpaginated fetch.
const listQuotationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
});

module.exports = { createQuotationSchema, listQuotationsQuerySchema };
