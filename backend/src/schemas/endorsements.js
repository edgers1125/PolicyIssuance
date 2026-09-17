const { z } = require("zod");
const { updateAddressSchema } = require("./addresses");

// Mirrors the Prisma EndorsementChangeType enum (enums.prisma), minus
// CANCEL_POLICY — that value only ever exists on a change row the server
// itself synthesizes for a CANCELLATION-type request (see
// createEndorsementRequestSchema's own superRefine and routes/endorsements.js's
// POST /); no client-submitted change may ever request it directly, on
// creation or via POST/PATCH /:id/changes.
const ENDORSEMENT_CHANGE_TYPES = [
  "POLICY_EFFECTIVE_DATE",
  "INSURED_NAME_DETAILS",
  "INSURED_ADDRESS_DETAILS",
  "VEHICLE_MODEL",
  "VEHICLE_MV_FILE",
  "VEHICLE_PLATE_NO",
  "VEHICLE_TYPE",
  "VEHICLE_MAKE",
  "VEHICLE_COLOR",
  "VEHICLE_ENGINE_NO",
  "VEHICLE_CHASSIS_NO",
  "EDIT_CLAUSE",
  "REMOVE_CLAUSE",
  "ADD_COVERAGE",
];

const REQUEST_TYPES = ["CORRECTION", "CANCELLATION"];

// Which change types need which reference id — used by this schema's own
// refinement and by routes/endorsements.js's change_from/change_to resolution.
const VEHICLE_CHANGE_TYPES = new Set([
  "VEHICLE_MODEL",
  "VEHICLE_MV_FILE",
  "VEHICLE_PLATE_NO",
  "VEHICLE_TYPE",
  "VEHICLE_MAKE",
  "VEHICLE_COLOR",
  "VEHICLE_ENGINE_NO",
  "VEHICLE_CHASSIS_NO",
]);
// Both target an *existing* PolicyCoverage line via policy_coverage_id —
// EDIT_CLAUSE edits its fine-print text only (no financial effect);
// REMOVE_CLAUSE removes the whole line (financial — see that enum value's
// own comment in enums.prisma).
const COVERAGE_TARGET_CHANGE_TYPES = new Set(["EDIT_CLAUSE", "REMOVE_CLAUSE"]);

// One amendment line — same shape/meaning as
// schemas/policyApplicationChanges.js's createApplicationChangeSchema, just
// addressed at a Policy's own PolicyVehicle/PolicyCoverage
// (policy_vehicle_id/policy_coverage_id) instead of an application's.
// change_from is never accepted here either — routes/endorsements.js always
// computes it itself from this policy's current (already-endorsed) state.
//
// ADD_COVERAGE additionally carries product_coverage_id/coverage_amount/
// premium_amount — the same three inputs an application/quotation's own
// coverage-selection form collects, run through lib/coveragePricing.js's
// resolveCoverageRows() by the route (never priced here — that needs DB
// lookups a zod schema can't do) to compute payable_to_bethel/applied_rate/
// is_misc, all frozen onto the EndorsementChange row at creation time.
// policy_vehicle_id doubles as this coverage's own optional target vehicle
// (required only when the coverage's own pricing mode needs one — checked by
// the route, since that also needs a DB lookup).
const endorsementChangeInputSchema = z
  .object({
    change_type: z.enum(ENDORSEMENT_CHANGE_TYPES, { error: "change_type is invalid" }),
    policy_vehicle_id: z.string().uuid("policy_vehicle_id must be a valid UUID").optional(),
    policy_coverage_id: z.string().uuid("policy_coverage_id must be a valid UUID").optional(),
    new_value: z.string().optional(),
    new_address: updateAddressSchema.omit({ estimated_value: true }).optional(),
    remarks: z.string().optional(),
    product_coverage_id: z.string().uuid("product_coverage_id must be a valid UUID").optional(),
    coverage_amount: z.coerce.number({ error: "coverage_amount is required" }).positive().optional(),
    premium_amount: z.coerce.number({ error: "premium_amount is required" }).positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (VEHICLE_CHANGE_TYPES.has(data.change_type) && !data.policy_vehicle_id) {
      ctx.addIssue({
        code: "custom",
        path: ["policy_vehicle_id"],
        message: "policy_vehicle_id is required for this change type",
      });
    }
    if (COVERAGE_TARGET_CHANGE_TYPES.has(data.change_type) && !data.policy_coverage_id) {
      ctx.addIssue({
        code: "custom",
        path: ["policy_coverage_id"],
        message: "policy_coverage_id is required for this change type",
      });
    }
    if (data.change_type === "ADD_COVERAGE") {
      if (!data.product_coverage_id) {
        ctx.addIssue({ code: "custom", path: ["product_coverage_id"], message: "product_coverage_id is required" });
      }
      if (data.coverage_amount === undefined) {
        ctx.addIssue({ code: "custom", path: ["coverage_amount"], message: "coverage_amount is required" });
      }
      if (data.premium_amount === undefined) {
        ctx.addIssue({ code: "custom", path: ["premium_amount"], message: "premium_amount is required" });
      }
    } else if (data.change_type === "INSURED_ADDRESS_DETAILS") {
      if (!data.new_address) {
        ctx.addIssue({ code: "custom", path: ["new_address"], message: "new_address is required for this change type" });
      }
    } else if (data.change_type !== "REMOVE_CLAUSE" && (!data.new_value || !data.new_value.trim())) {
      ctx.addIssue({ code: "custom", path: ["new_value"], message: "new_value is required for this change type" });
    }
  });

// POST / — an agent files the whole batch of proposed changes in one
// request (the Client Policies page's "Create Endorsement Request" panel).
// A CORRECTION (the default) needs at least one change, since a no-op filing
// makes no sense; a CANCELLATION carries no client-submitted changes at all
// (the server synthesizes its own single CANCEL_POLICY line — see
// routes/endorsements.js's POST /) but does require a stated reason.
const createEndorsementRequestSchema = z
  .object({
    policy_id: z.string().uuid("policy_id must be a valid UUID"),
    request_type: z.enum(REQUEST_TYPES, { error: "request_type is invalid" }).optional().default("CORRECTION"),
    effective_date: z.coerce.date({ error: "effective_date must be a valid date" }),
    remarks: z.string().optional(),
    send_policy_to_email: z.coerce.boolean().optional().default(false),
    send_policy_to_email_on_approval: z.coerce.boolean().optional().default(false),
    changes: z.array(endorsementChangeInputSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.request_type === "CORRECTION" && data.changes.length < 1) {
      ctx.addIssue({ code: "custom", path: ["changes"], message: "At least one change is required" });
    }
    if (data.request_type === "CANCELLATION") {
      if (data.changes.length > 0) {
        ctx.addIssue({ code: "custom", path: ["changes"], message: "A cancellation request cannot carry any other changes" });
      }
      if (!data.remarks || !data.remarks.trim()) {
        ctx.addIssue({ code: "custom", path: ["remarks"], message: "A reason is required to cancel a policy" });
      }
    }
  });

// POST /:id/changes (approver adds one more line) and PATCH
// /:id/changes/:changeId (approver edits an existing one) share this same
// per-line shape. CANCEL_POLICY is rejected by the route itself (never
// addable/editable as a standalone line — see that enum value's own comment).
const endorsementChangeSchema = endorsementChangeInputSchema;

const rejectEndorsementSchema = z.object({
  remarks: z
    .string()
    .trim()
    .min(1, "remarks is required")
    .max(1000, "remarks must be at most 1000 characters"),
});

const listEndorsementRequestsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().trim().optional(),
  status: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]).optional(),
  request_type: z.enum(REQUEST_TYPES).optional(),
});

const endorsementIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

const endorsementChangeIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
  changeId: z.string().uuid("changeId must be a valid UUID"),
});

const policyIdParamSchema = z.object({
  policyId: z.string().uuid("policyId must be a valid UUID"),
});

module.exports = {
  ENDORSEMENT_CHANGE_TYPES,
  REQUEST_TYPES,
  VEHICLE_CHANGE_TYPES,
  COVERAGE_TARGET_CHANGE_TYPES,
  createEndorsementRequestSchema,
  endorsementChangeSchema,
  rejectEndorsementSchema,
  listEndorsementRequestsQuerySchema,
  endorsementIdParamSchema,
  endorsementChangeIdParamSchema,
  policyIdParamSchema,
};
