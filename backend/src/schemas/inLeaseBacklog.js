const { z } = require("zod");

// Pagination + search/filter for GET / — same shape/cap as every other
// tracker list. status is derived (not a stored column — see
// routes/inLeaseBacklog.js's toInLeaseSummary()), not a real PolicyStatus/
// ApplicationStatus-style enum: PENDING means at least one of the policy's
// InLeaseBacklog rows is still unaccomplished, ACCOMPLISHED means every one
// of them is.
const listInLeaseBacklogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().trim().optional(),
  status: z.enum(["PENDING", "ACCOMPLISHED"]).optional(),
});

// :id path param — shared shape for GET /:id (a Policy id) and
// POST /:id/accomplish, POST /:id/undo (an InLeaseBacklog id). Both are a
// plain UUID path segment; kept as one schema since there's no behavioral
// difference in what's being validated, only in what the id happens to
// address at each route.
const idParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

module.exports = { listInLeaseBacklogQuerySchema, idParamSchema };
