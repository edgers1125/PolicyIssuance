const { z } = require("zod");

const netrateEntrySchema = z.object({
  coverage_id: z.string().min(1, "coverage_id is required"),
  netrate: z.coerce.number(),
  maximum_coverage: z.coerce.number().nullable().optional(),
});

const updateNetratesSchema = z.object({
  netrates: z.array(netrateEntrySchema),
});

module.exports = { updateNetratesSchema };
