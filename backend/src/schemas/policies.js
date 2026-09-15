const { z } = require("zod");

// Pagination for GET /policies — same shape/cap as every other tracker list
// (listApplicationsQuerySchema, listQuotationsQuerySchema, ...).
const listPoliciesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
});

// :id path param shared by GET /:id and GET /:id/pdf.
const policyIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

module.exports = { listPoliciesQuerySchema, policyIdParamSchema };
