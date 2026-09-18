const { z } = require("zod");
const { requiredString, requiredEmail } = require("./common");

// Used for both create and update — this API has never allowed a partial
// customer edit, every field below is required on both.
const customerInputSchema = z.object({
  first_name: requiredString("first_name"),
  last_name: requiredString("last_name"),
  middle_name: z.string().optional(),
  // The UI sends "" for a blank date picker — treat that the same as omitted
  // rather than rejecting it as an invalid date.
  birthday: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.date({ error: "birthday must be a valid date" }).optional()
  ),
  gender: z.string().optional(),
  email: requiredEmail(),
  mobile_number: z.string().optional(),
});

// POST /customers only — customerInputSchema's own shape plus an optional
// agent_id, letting a caller who holds QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION
// or APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION create a brand-new customer
// linked to a chosen agent instead of always their own (see the route's own
// handling — omitted, this behaves exactly as it did before this existed).
// A separate schema from customerInputSchema, not an extra field bolted onto
// it, since PATCH /:id — which also uses customerInputSchema — never reads
// agent_id at all; describing a field a route doesn't read would violate
// this project's own schema-per-route contract.
const createCustomerSchema = customerInputSchema.and(
  z.object({
    agent_id: z.string().uuid("agent_id must be a valid UUID").optional(),
  })
);

// GET /customers/agent/:agentId — QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION's
// cross-agent customer picker.
const agentIdParamSchema = z.object({
  agentId: z.string().uuid("agentId must be a valid UUID"),
});

module.exports = { customerInputSchema, createCustomerSchema, agentIdParamSchema };
