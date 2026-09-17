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
const createAgentSchema = z
  .object({
    agent_type: z.enum(AGENT_TYPES, { error: "agent_type is required" }),
    agent_code: z.string().trim().min(1, "agent_code is required").optional(),
    agent_name: z.string().trim().min(1, "agent_name is required").optional(),
    work_email: z.string().trim().email("work_email must be a valid email address").optional(),
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

// VEHICLE_SEATS_BASED-mode override of the seat threshold: unlike the tier
// tables (a replace-all list, see agentSeatTierSchema below), this is a
// single scalar per (agent, coverage, period) — same "one scalar override"
// shape as AgentNetrate. null clears the override back to the coverage's
// own default.
const updateAgentSeatsBasedPricingSchema = z.object({
  coverage_in_days: coverageInDaysField,
  threshold_seats: z.coerce.number({ error: "threshold_seats is required" }).int().nonnegative().nullable(),
});

// VEHICLE_SEATS_BASED-mode override of the tier menu itself — same
// replace-all pattern as agentFlatTierSchema, just keyed by
// insured_amount_per_occupant instead of coverage_amount.
const agentSeatTierSchema = z.object({
  insured_amount_per_occupant: z.coerce.number({ error: "insured_amount_per_occupant is required" }).positive(),
  rate_per_excess_seat: z.coerce.number({ error: "rate_per_excess_seat is required" }).nonnegative(),
});

const updateAgentSeatTiersSchema = z.object({
  coverage_in_days: coverageInDaysField,
  tiers: z.array(agentSeatTierSchema),
});

module.exports = {
  createAgentSchema,
  getAgentRatesQuerySchema,
  updateNetratesSchema,
  updateAgentValueTiersSchema,
  updateAgentFlatTiersSchema,
  updateAgentSeatsBasedPricingSchema,
  updateAgentSeatTiersSchema,
};
