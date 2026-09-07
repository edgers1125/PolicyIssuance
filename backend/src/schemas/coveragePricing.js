const { z } = require("zod");

const PRICING_MODES = ["PERCENTAGE", "VALUE_PERCENTAGE", "FLAT_TIER"];

const updatePricingModeSchema = z.object({
  pricing_mode: z.enum(PRICING_MODES, { error: `pricing_mode must be one of: ${PRICING_MODES.join(", ")}` }),
  // Only meaningful (and only saved) when pricing_mode is PERCENTAGE.
  standard_rate: z.coerce.number({ error: "standard_rate must be a positive number" }).positive().optional(),
});

const valuePercentageTierSchema = z.object({
  min_value: z.coerce.number({ error: "min_value is required" }).nonnegative(),
  rate_percentage: z.coerce.number({ error: "rate_percentage is required" }).nonnegative(),
});

const updateValuePercentageTiersSchema = z.object({
  tiers: z.array(valuePercentageTierSchema),
});

const flatTierSchema = z.object({
  coverage_amount: z.coerce.number({ error: "coverage_amount is required" }).positive(),
  coverage_price: z.coerce.number({ error: "coverage_price is required" }).nonnegative(),
});

const updateFlatTiersSchema = z.object({
  tiers: z.array(flatTierSchema),
});

module.exports = {
  PRICING_MODES,
  updatePricingModeSchema,
  updateValuePercentageTiersSchema,
  updateFlatTiersSchema,
};
