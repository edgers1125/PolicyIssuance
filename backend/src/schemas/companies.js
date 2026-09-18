const { z } = require("zod");
const { requiredString, requiredEmail } = require("./common");

// Used for both create and update — this API has never allowed a partial
// company edit, every field is required on both.
const companyInputSchema = z.object({
  company_code: requiredString("company_code"),
  company_name: requiredString("company_name"),
  tin_no: z.string().optional(),
  email: requiredEmail(),
});

// POST /companies only — companyInputSchema's own shape plus an optional
// agent_id, same reasoning as schemas/customers.js's own createCustomerSchema
// (a separate schema rather than a field bolted onto companyInputSchema,
// since neither PATCH /:id nor schemas/agents.js's own new_company reuse of
// companyInputSchema ever read it).
const createCompanySchema = companyInputSchema.and(
  z.object({
    agent_id: z.string().uuid("agent_id must be a valid UUID").optional(),
  })
);

// GET /companies/agent/:agentId — QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION's
// cross-agent company picker.
const agentIdParamSchema = z.object({
  agentId: z.string().uuid("agentId must be a valid UUID"),
});

module.exports = { companyInputSchema, createCompanySchema, agentIdParamSchema };
