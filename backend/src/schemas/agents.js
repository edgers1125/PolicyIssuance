const { z } = require("zod");

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

module.exports = {
  getAgentRatesQuerySchema,
  updateNetratesSchema,
  updateAgentValueTiersSchema,
  updateAgentFlatTiersSchema,
};
