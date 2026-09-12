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

const PAYMENT_METHODS = ["CASH", "CHECK", "CREDIT_CARD", "BANK_TRANSFER", "ONLINE_PAYMENT"];
const PAYMENT_REMITTANCES = ["DIRECT_TO_BETHEL", "THROUGH_AGENT"];

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
    payment_method: z.enum(PAYMENT_METHODS),
    payment_remittance: z.enum(PAYMENT_REMITTANCES),
    bethel_payment_method_id: z.string().optional(),
  })
  .refine(refineExactlyOneParty, exactlyOnePartyRefinement)
  .refine(refineWholeDayPeriod, wholeDayPeriodRefinement)
  .refine((data) => data.payment_remittance !== "DIRECT_TO_BETHEL" || Boolean(data.bethel_payment_method_id), {
    message: "bethel_payment_method_id is required when payment goes directly to Bethel",
    path: ["bethel_payment_method_id"],
  });

module.exports = { createApplicationSchema };
