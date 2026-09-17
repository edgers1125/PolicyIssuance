const { z } = require("zod");
const { APPLICATION_STATUSES } = require("./policyApplications");

// Pagination + search/filters for GET /policy-approval — same shape as
// listApplicationsQuerySchema (reuses its APPLICATION_STATUSES), plus an
// agent_id filter that one has no reason to offer (it's always scoped to the
// caller's own agent there; this table spans every agent). applicationIdParamSchema
// is reused directly from schemas/policyApplications.js (same {id: uuid} shape,
// no reason to duplicate it) by the routes that need it.
const listAllApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
  // Matched against the application number, the insured's own name, and (own
  // to this table only — every other tracker is already scoped to one agent)
  // the filing agent's own code/name.
  search: z.string().trim().optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  policy_type: z.enum(["NEW_POLICY", "RENEWAL"]).optional(),
  class_id: z.string().uuid("class_id must be a valid UUID").optional(),
  agent_id: z.string().uuid("agent_id must be a valid UUID").optional(),
});

// POST /:id/approve's optional body — an approver can attach a COC (Certificate
// of Cover) number and/or an SA (Special Authority?) number at the moment of
// approval, printed on the issued Policy PDF (see pdf/policyPdf.js). Both are
// genuinely optional (not every policy gets one assigned at issuance), so an
// empty string is normalized to undefined here rather than persisted as "".
const approveApplicationSchema = z.object({
  coc_number: z
    .string()
    .trim()
    .max(50, "coc_number must be at most 50 characters")
    .optional()
    .transform((v) => v || undefined),
  sa_number: z
    .string()
    .trim()
    .max(50, "sa_number must be at most 50 characters")
    .optional()
    .transform((v) => v || undefined),
});

// POST /:id/reject's body — remarks are required here (unlike approve's
// optional coc_number/sa_number) since a rejection needs a stated reason for
// the filing agent to act on; also written onto the ApprovalHistory row's
// own comments column.
const rejectApplicationSchema = z.object({
  remarks: z
    .string()
    .trim()
    .min(1, "remarks is required")
    .max(1000, "remarks must be at most 1000 characters"),
});

module.exports = { listAllApplicationsQuerySchema, approveApplicationSchema, rejectApplicationSchema };
