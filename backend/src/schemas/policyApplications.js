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
  paymentFieldsSchema,
  refineBethelPaymentMethod,
  bethelPaymentMethodRefinement,
} = require("./policyIntakeShared");

// Whether each class needs a vehicle, a risk address, etc. depends on a DB
// lookup (the product variant's insurance class) that a static schema can't
// perform — that part of the requirement stays as a business-logic check in
// the route. This schema only pins down the *shape* of whatever was sent.
const createApplicationSchema = z
  .object({
    // insured_type is no longer accepted from the client — which one applies
    // is derived from whichever of customer_id/company_id was actually sent,
    // checked below, rather than trusted as a separate (and possibly
    // inconsistent) field.
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
    send_policy_to_email_on_approval: z.boolean().optional(),
    // Shape-only here — a valid UUID string. Whether it's actually honored
    // (ownership of the referenced Policy, and coverage_start_at not
    // preceding its expiry_date) is the route's own business-logic check,
    // not something a static schema can express. Present only on the
    // Client Policies page's "Renew This Policy" flow; omitted, this
    // application is policy_type: NEW_POLICY (the default).
    renewed_policy_id: z.string().uuid().optional(),
  })
  .merge(paymentFieldsSchema)
  .refine(refineExactlyOneParty, exactlyOnePartyRefinement)
  .refine(refineWholeDayPeriod, wholeDayPeriodRefinement)
  .refine(refineBethelPaymentMethod, bethelPaymentMethodRefinement);

// Pagination for GET /policy-applications — same shape/cap as
// listQuotationsQuerySchema.
const listApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
});

// :id path param shared by GET /:id, GET /:id/changes, GET /:id/pdf, and
// POST /:id/resend-email.
const applicationIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

module.exports = { createApplicationSchema, listApplicationsQuerySchema, applicationIdParamSchema };
