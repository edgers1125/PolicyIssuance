const { z } = require("zod");

const PRICING_MODES = ["PERCENTAGE", "VALUE_PERCENTAGE", "FLAT_TIER"];

// Every pricing table (standard_rate, and both tier tables) is scoped to one
// of the coverage's allowable periods now — pricing_mode itself stays
// coverage-wide (a coverage can't switch pricing scheme per period), but the
// actual rate/tiers underneath it can differ by period, so every read/write
// below has to say which period it means.
const coverageInDaysField = z.coerce.number({ error: "coverage_in_days is required" }).int().positive();

const getPricingQuerySchema = z.object({
  coverage_in_days: coverageInDaysField,
});

const updatePricingModeSchema = z.object({
  pricing_mode: z.enum(PRICING_MODES, { error: `pricing_mode must be one of: ${PRICING_MODES.join(", ")}` }),
  coverage_in_days: coverageInDaysField,
  // Only meaningful (and only saved) when pricing_mode is PERCENTAGE.
  standard_rate: z.coerce.number({ error: "standard_rate must be a positive number" }).positive().optional(),
});

const valuePercentageTierSchema = z.object({
  min_value: z.coerce.number({ error: "min_value is required" }).nonnegative(),
  rate_percentage: z.coerce.number({ error: "rate_percentage is required" }).nonnegative(),
});

const updateValuePercentageTiersSchema = z.object({
  coverage_in_days: coverageInDaysField,
  tiers: z.array(valuePercentageTierSchema),
});

const flatTierSchema = z.object({
  coverage_amount: z.coerce.number({ error: "coverage_amount is required" }).positive(),
  coverage_price: z.coerce.number({ error: "coverage_price is required" }).nonnegative(),
});

const updateFlatTiersSchema = z.object({
  coverage_in_days: coverageInDaysField,
  tiers: z.array(flatTierSchema),
});

// Adds a new allowable period to a coverage — used from the Manage Coverage
// Pricing page's period picker when the admin wants a day count that isn't
// already one of the coverage's options.
const createAllowablePeriodSchema = z.object({
  coverage_in_days: coverageInDaysField,
});

module.exports = {
  PRICING_MODES,
  getPricingQuerySchema,
  updatePricingModeSchema,
  updateValuePercentageTiersSchema,
  updateFlatTiersSchema,
  createAllowablePeriodSchema,
};
