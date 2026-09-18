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

// GET /customers/lookup — the "find an existing customer by email or mobile
// number" flow (Customer.email/mobile_number are both unique, see that
// model's own schema comment), same "one free-text query field" shape as
// vehicles.js's own lookupVehicleQuerySchema.
const lookupCustomerQuerySchema = z.object({
  query: requiredString("query"),
});

// POST /customers/:id/connect — id is the already-existing Customer to
// connect to (a plain param, reusing the same param name convention every
// other :id route in this app uses rather than a dedicated schema file).
const customerIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

// POST /customers/:id/connect's own body — same optional agent_id override
// as createCustomerSchema, same reasoning (a caller filing under a chosen
// agent may not have one of their own).
const connectCustomerSchema = z.object({
  agent_id: z.string().uuid("agent_id must be a valid UUID").optional(),
});

module.exports = {
  customerInputSchema,
  createCustomerSchema,
  agentIdParamSchema,
  lookupCustomerQuerySchema,
  customerIdParamSchema,
  connectCustomerSchema,
};
