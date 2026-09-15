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

// GET /companies/agent/:agentId — QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION's
// cross-agent company picker.
const agentIdParamSchema = z.object({
  agentId: z.string().uuid("agentId must be a valid UUID"),
});

module.exports = { companyInputSchema, agentIdParamSchema };
