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
    // No longer client-supplied — the "Miscellaneous" charge is now a flat
    // fee configured on the chosen product_variant (ProductVariant.misc_fee)
    // rather than an amount the agent types in per filing.
    send_policy_to_email: z.boolean().optional(),
    // Which agent this quotation is filed under — omitted, it's always the
    // caller's own linked agent. Only a caller holding
    // QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION may set this to someone
    // else's; the route 403s if a caller without that grant sends one that
    // isn't their own. Shape-only here — whether it's actually allowed is a
    // permission check, not something a static schema can express.
    agent_id: z.string().uuid("agent_id must be a valid UUID").optional(),
  })
  .refine(refineExactlyOneParty, exactlyOnePartyRefinement)
  .refine(refineWholeDayPeriod, wholeDayPeriodRefinement);

// PATCH /policy-quotations/:id — deliberately narrow: only the fields the
// Quotation Tracker's edit action actually lets an agent change (coverage
// period, whether the policy gets emailed, and the priced coverages
// themselves). Everything else about a quotation (party, product, vehicles,
// addresses) is set once at creation and never touched here — changing any
// of those is really a different quotation, not an edit of this one.
const updateQuotationSchema = z
  .object({
    coverage_start_at: z.coerce.date({ error: "coverage_start_at is required and must be a valid date" }),
    coverage_end_at: z.coerce.date({ error: "coverage_end_at is required and must be a valid date" }),
    coverages: z.array(coverageSelectionSchema).min(1, "At least one coverage must be selected"),
    send_policy_to_email: z.boolean().optional(),
  })
  .refine(refineWholeDayPeriod, wholeDayPeriodRefinement);

// POST /policy-quotations/:id/submit — converting a quotation into a policy
// application. The quotation already has everything an application needs
// *except* payment info (it was never collected — nothing was being paid
// for yet) and the two application-only delivery flags — send_policy_to_email
// is asked again here (rather than silently carried over from the
// quotation's own value) since "email the client that their application is
// now under approval" is a distinct decision from "email the client the
// quotation itself", and send_policy_to_email_on_approval has no quotation
// value to carry over from at all, a quotation never being itself approved.
const submitQuotationSchema = paymentFieldsSchema
  .extend({ send_policy_to_email: z.boolean().optional(), send_policy_to_email_on_approval: z.boolean().optional() })
  .refine(refineBethelPaymentMethod, bethelPaymentMethodRefinement);

// Pagination + search/filters for GET /policy-quotations — capped page_size
// so a caller can't force one giant unpaginated fetch. `status` is
// SUBMITTED/FOR_ISSUANCE/POLICY_ISSUED, the same derived-not-stored triple
// the route's own response already computes off `converted_application`/its
// own `policy` relation (see GET / above) — filtering on it means "not yet
// converted" / "converted, still pending approval" / "converted and
// approved", not a real column.
const listQuotationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().trim().optional(),
  status: z.enum(["SUBMITTED", "FOR_ISSUANCE", "POLICY_ISSUED"]).optional(),
  class_id: z.string().uuid("class_id must be a valid UUID").optional(),
});

// :id path param shared by GET /:id and POST /:id/resend-email.
const quotationIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

module.exports = {
  createQuotationSchema,
  updateQuotationSchema,
  submitQuotationSchema,
  listQuotationsQuerySchema,
  quotationIdParamSchema,
};
