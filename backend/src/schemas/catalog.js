const { z } = require("zod");
const { requiredString } = require("./common");
const { PRICING_MODES } = require("./coveragePricing");

// Every field is optional here since a PATCH only ever touches the field
// group(s) the caller has permission for; the route decides what's allowed.
const updateCoverageSchema = z.object({
  coverage_code: z.string().min(1, "coverage_code cannot be empty").optional(),
  coverage_name: z.string().min(1, "coverage_name cannot be empty").optional(),
  clause: z.string().min(1, "clause cannot be empty").optional(),
  maximum_coverage: z.coerce.number().positive("maximum_coverage must be a positive number").optional(),
  is_misc: z.coerce.boolean().optional(),
});

const productVariantIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

// Every field optional — a PATCH only ever touches the field group(s) the
// caller has permission for (see PATCH /product-variants/:id's field-gating):
// variant_code/variant_name need MANAGE_PRODUCTS, deductible_rate needs
// either MANAGE_COVERAGE_PRICING or MANAGE_PRODUCTS. It can also be cleared
// back to unconfigured by sending null explicitly.
const updateProductVariantSchema = z.object({
  variant_code: z.string().min(1, "variant_code cannot be empty").optional(),
  variant_name: z.string().min(1, "variant_name cannot be empty").optional(),
  deductible_rate: z.coerce.number().nonnegative("deductible_rate must be zero or greater").nullable().optional(),
  misc_fee: z.coerce.number().nonnegative("misc_fee must be zero or greater").nullable().optional(),
});

const insuranceClassIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

// Both optional — gated entirely behind MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_DETAILS.
const updateInsuranceClassSchema = z.object({
  class_name: z.string().min(1, "class_name cannot be empty").optional(),
  description: z.string().optional(),
});

// Settings → Manage Products' "Add Insurance Class" action.
const createInsuranceClassSchema = z.object({
  class_name: requiredString("class_name"),
  description: z.string().optional(),
});

// Settings → Manage Products' "Add Product Variant" action. Unlike
// updateProductVariantSchema above (a PATCH that can clear either back to
// null), deductible_rate/misc_fee are required on create — a new variant
// must already be fully priced before it's usable for an application:
// deductible_rate for the policy schedule's Section III Deductible/
// Authorized Repair Limit line (the repair limit itself is just that
// deductible plus a fixed towing amount — see pdf/theme.js's TOWING_AMOUNT —
// so there's no second rate to require), and misc_fee as the flat
// "Miscellaneous" charge every application/quotation filed under this
// variant will carry (0 is a valid, deliberate choice).
const createProductVariantSchema = z.object({
  insurance_class_id: z.string().uuid("insurance_class_id must be a valid UUID"),
  variant_code: requiredString("variant_code"),
  variant_name: requiredString("variant_name"),
  description: z.string().optional(),
  deductible_rate: z.coerce
    .number({ error: "deductible_rate is required" })
    .nonnegative("deductible_rate must be zero or greater"),
  misc_fee: z.coerce.number({ error: "misc_fee is required" }).nonnegative("misc_fee must be zero or greater"),
});

// Settings → Manage Products' "Add Coverage" action. Only the catalog row
// itself — allowable periods and their rate/tier tables are still configured
// afterward via Settings → Manage Coverage Pricing, same as any other coverage.
const createProductCoverageSchema = z.object({
  product_variant_id: z.string().uuid("product_variant_id must be a valid UUID"),
  coverage_code: requiredString("coverage_code"),
  coverage_name: requiredString("coverage_name"),
  maximum_coverage: z.coerce
    .number({ error: "maximum_coverage is required" })
    .positive("maximum_coverage must be a positive number"),
  clause: requiredString("clause"),
  pricing_mode: z.enum(PRICING_MODES, { error: `pricing_mode must be one of: ${PRICING_MODES.join(", ")}` }),
  // Whether this coverage's own premium is folded into the filing's
  // Miscellaneous charge instead of its own Premium total — see
  // ProductCoverage.is_misc (catalog.prisma) and lib/coveragePricing.js's
  // resolveCoverageRows. Optional, defaulting to false (most coverages price
  // straight into the Premium total, same as before this flag existed).
  is_misc: z.coerce.boolean().optional().default(false),
});

// Settings → Manage Products' "Save" on staged/pending deletions — every
// array is optional (defaults to none), and every id in it is deleted
// together in one transaction/request (see PATCH /manage-products/batch-delete)
// rather than one request per item, however many tiers/items are marked.
const idArray = z.array(z.string().uuid()).default([]);
const batchDeleteSchema = z.object({
  class_ids: idArray,
  variant_ids: idArray,
  coverage_ids: idArray,
  period_ids: idArray,
});

module.exports = {
  updateCoverageSchema,
  productVariantIdParamSchema,
  updateProductVariantSchema,
  insuranceClassIdParamSchema,
  updateInsuranceClassSchema,
  createInsuranceClassSchema,
  createProductVariantSchema,
  createProductCoverageSchema,
  batchDeleteSchema,
};
