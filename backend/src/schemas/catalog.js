const { z } = require("zod");

// Every field is optional here since a PATCH only ever touches the field
// group(s) the caller has permission for; the route decides what's allowed.
const updateCoverageSchema = z.object({
  clause: z.string().min(1, "clause cannot be empty").optional(),
  maximum_coverage: z.coerce.number().positive("maximum_coverage must be a positive number").optional(),
});

const productVariantIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

// Both optional — Settings → Vehicle Rates only ever sets one or the other
// (or both) on a variant; either can also be cleared back to unconfigured by
// sending null explicitly.
const updateProductVariantRatesSchema = z.object({
  deductible_rate: z.coerce.number().nonnegative("deductible_rate must be zero or greater").nullable().optional(),
  authorized_repair_limit_rate: z.coerce
    .number()
    .nonnegative("authorized_repair_limit_rate must be zero or greater")
    .nullable()
    .optional(),
});

module.exports = { updateCoverageSchema, productVariantIdParamSchema, updateProductVariantRatesSchema };
