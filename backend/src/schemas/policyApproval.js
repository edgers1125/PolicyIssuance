const { z } = require("zod");

// Pagination for GET /policy-approval — same shape/cap as
// listApplicationsQuerySchema/listQuotationsQuerySchema. applicationIdParamSchema
// is reused directly from schemas/policyApplications.js (same {id: uuid} shape,
// no reason to duplicate it) by the routes that need it.
const listAllApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
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

module.exports = { listAllApplicationsQuerySchema, approveApplicationSchema };
