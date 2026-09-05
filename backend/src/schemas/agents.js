const { z } = require("zod");
const { requiredString } = require("./common");

const netrateEntrySchema = z.object({
  coverage_id: requiredString("coverage_id"),
  // null is rejected the same as a missing value — the client should send a
  // real rate or omit the coverage entirely, not send an explicit null.
  netrate: z.preprocess(
    (v) => (v === null ? undefined : v),
    z.coerce.number({ error: "netrate is required" })
  ),
  maximum_coverage: z.coerce.number().nullable().optional(),
});

const updateNetratesSchema = z.object({
  netrates: z.array(netrateEntrySchema),
});

module.exports = { updateNetratesSchema };
