const { z } = require("zod");

// Every field is optional here since a PATCH only ever touches the field
// group(s) the caller has permission for; the route decides what's allowed.
const updateCoverageSchema = z.object({
  clause: z.string().min(1, "clause cannot be empty").optional(),
  standard_rate: z.coerce.number().positive("standard_rate must be a positive number").optional(),
  maximum_coverage: z.coerce.number().positive("maximum_coverage must be a positive number").optional(),
});

module.exports = { updateCoverageSchema };
