const { z } = require("zod");

// Pagination + search/filters for GET /policies — same shape/cap as every
// other tracker list (listApplicationsQuerySchema, listQuotationsQuerySchema,
// ...). policy_status is the real PolicyStatus enum column (enums.prisma),
// unlike a quotation's own derived, unstored "status".
const listPoliciesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().trim().optional(),
  policy_status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED", "LAPSED"]).optional(),
  class_id: z.string().uuid("class_id must be a valid UUID").optional(),
});

// :id path param shared by GET /:id and GET /:id/pdf.
const policyIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

// Pagination + search for GET /policies/clients (the My Clients page's
// "Clients" tab) — no status/class filter here, since a client isn't itself
// a policy and has neither of those columns; search matches name/email only.
const listClientsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().trim().optional(),
  type: z.enum(["INDIVIDUAL", "CORPORATE"]).optional(),
});

module.exports = { listPoliciesQuerySchema, policyIdParamSchema, listClientsQuerySchema };
