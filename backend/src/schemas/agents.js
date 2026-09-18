const { z } = require("zod");
const { companyInputSchema } = require("./companies");

// POST /agents — an INDIVIDUAL agent may optionally name a CORPORATE agent
// as its company (see Agent.company_id); a CORPORATE agent never has one
// itself (single level, no chains) — enforced by the refinement below rather
// than the route, so a bad combination 400s before any DB lookup.
//
// A CORPORATE agent may instead optionally back itself with a real
// insured-party Company record (Agent.linked_company_id) — either
// `linked_company_id` (an existing Company) or `new_company` (create one in
// the same request, same shape as POST /companies), never both. Wholly
// unrelated to the self-referential company_id above.
//
// A company-backed CORPORATE agent (either branch above) takes its own
// agent_code/agent_name/work_email straight from that Company's own
// company_code/company_name/email instead of the caller retyping the same
// three values twice — see routes/agents.js's POST /, which derives (and
// overrides whatever the client sent for) these fields whenever
// linked_company_id/new_company is present. They're therefore only required
// here when this agent ISN'T company-backed (an INDIVIDUAL, or a CORPORATE
// agent with neither linked_company_id nor new_company).
const AGENT_TYPES = ["INDIVIDUAL", "CORPORATE"];
// How many days after a payable-ledger bucket's own basis date (a policy's
// issue_date, or an ADD_COVERAGE endorsement's own effective_date) it
// becomes overdue — see Agent.payment_terms_days's own schema comment.
// Required on every create (no "unset" state going forward); editable
// afterward via PATCH /agents/:id (updateAgentDetailsSchema below).
const paymentTermsDaysField = z.coerce
  .number({ error: "payment_terms_days is required" })
  .int()
  .nonnegative("payment_terms_days cannot be negative");

const createAgentSchema = z
  .object({
    agent_type: z.enum(AGENT_TYPES, { error: "agent_type is required" }),
    agent_code: z.string().trim().min(1, "agent_code is required").optional(),
    agent_name: z.string().trim().min(1, "agent_name is required").optional(),
    work_email: z.string().trim().email("work_email must be a valid email address").optional(),
    payment_terms_days: paymentTermsDaysField,
    company_id: z.string().uuid("company_id must be a valid UUID").optional(),
    linked_company_id: z.string().uuid("linked_company_id must be a valid UUID").optional(),
    new_company: companyInputSchema.optional(),
  })
  .refine((data) => data.agent_type === "INDIVIDUAL" || !data.company_id, {
    message: "A company agent cannot itself belong to another company",
    path: ["company_id"],
  })
  .refine((data) => data.agent_type === "CORPORATE" || (!data.linked_company_id && !data.new_company), {
    message: "Only a company agent can be backed by a Company record",
    path: ["linked_company_id"],
  })
  .refine((data) => !(data.linked_company_id && data.new_company), {
    message: "Provide either linked_company_id or new_company, not both",
    path: ["linked_company_id"],
  })
  .refine((data) => data.agent_type !== "CORPORATE" || Boolean(data.linked_company_id || data.new_company), {
    message: "A company agent must be linked to an existing company or have a new one created",
    path: ["linked_company_id"],
  })
  .refine((data) => Boolean(data.agent_code) || (data.agent_type === "CORPORATE" && (data.linked_company_id || data.new_company)), {
    message: "agent_code is required",
    path: ["agent_code"],
  })
  .refine((data) => Boolean(data.agent_name) || (data.agent_type === "CORPORATE" && (data.linked_company_id || data.new_company)), {
    message: "agent_name is required",
    path: ["agent_name"],
  })
  .refine((data) => Boolean(data.work_email) || (data.agent_type === "CORPORATE" && (data.linked_company_id || data.new_company)), {
    message: "work_email is required",
    path: ["work_email"],
  });

// Every override below is scoped to one of the coverage's allowable periods
// now, same as the coverage's own default pricing — an agent can have a
// different net rate/tier table for a coverage's 180-day period than its
// 365-day one, so every read/write has to say which period it means.
const coverageInDaysField = z.coerce.number({ error: "coverage_in_days is required" }).int().positive();

const getAgentRatesQuerySchema = z.object({
  coverage_in_days: coverageInDaysField,
});

const netrateEntrySchema = z.object({
  coverage_id: z.string().min(1, "coverage_id is required"),
  netrate: z.coerce.number(),
  maximum_coverage: z.coerce.number().nullable().optional(),
});

const updateNetratesSchema = z.object({
  coverage_in_days: coverageInDaysField,
  netrates: z.array(netrateEntrySchema),
});

// Mirrors schemas/coveragePricing.js's tier shapes exactly — same replace-all
// pattern, just scoped to one agent's override for one coverage+period
// instead of the coverage's own defaults.
const agentValueTierSchema = z.object({
  min_value: z.coerce.number({ error: "min_value is required" }).nonnegative(),
  rate_percentage: z.coerce.number({ error: "rate_percentage is required" }).nonnegative(),
});

const updateAgentValueTiersSchema = z.object({
  coverage_in_days: coverageInDaysField,
  tiers: z.array(agentValueTierSchema),
});

const agentFlatTierSchema = z.object({
  coverage_amount: z.coerce.number({ error: "coverage_amount is required" }).positive(),
  coverage_price: z.coerce.number({ error: "coverage_price is required" }).nonnegative(),
});

const updateAgentFlatTiersSchema = z.object({
  coverage_in_days: coverageInDaysField,
  tiers: z.array(agentFlatTierSchema),
});

// VEHICLE_SEATS_BASED-mode override of the excess-of-value bracket charge:
// unlike the tier table (a replace-all list, see agentSeatTierSchema below),
// this is three scalars per (agent, coverage, period), always sent/cleared
// together — same "one scalar-set override" shape as AgentNetrate. `null`
// clears the whole override back to the coverage's own default.
const updateAgentSeatsBasedPricingSchema = z.object({
  coverage_in_days: coverageInDaysField,
  threshold_amount: z.coerce.number({ error: "threshold_amount is required" }).nonnegative().nullable(),
  exceed_threshold_amount: z.coerce.number({ error: "exceed_threshold_amount is required" }).positive().nullable(),
  exceed_threshold_price: z.coerce.number({ error: "exceed_threshold_price is required" }).nonnegative().nullable(),
});

// VEHICLE_SEATS_BASED-mode override of the tier menu itself — same
// replace-all pattern as agentFlatTierSchema, just keyed by
// insured_amount_per_occupant instead of coverage_amount. No per-tier rate
// any more — see updateAgentSeatsBasedPricingSchema above.
const agentSeatTierSchema = z.object({
  insured_amount_per_occupant: z.coerce.number({ error: "insured_amount_per_occupant is required" }).positive(),
});

const updateAgentSeatTiersSchema = z.object({
  coverage_in_days: coverageInDaysField,
  tiers: z.array(agentSeatTierSchema),
});

// PATCH /agents/:id — currently the only editable basic field on an
// already-created agent (agent_code/agent_name/work_email have no edit path
// at all yet; company_id/linked_company_id are set once at creation via
// POST / and not revisited here).
const updateAgentDetailsSchema = z.object({
  payment_terms_days: paymentTermsDaysField,
});

module.exports = {
  createAgentSchema,
  updateAgentDetailsSchema,
  getAgentRatesQuerySchema,
  updateNetratesSchema,
  updateAgentValueTiersSchema,
  updateAgentFlatTiersSchema,
  updateAgentSeatsBasedPricingSchema,
  updateAgentSeatTiersSchema,
};
