const { z } = require("zod");

const PRICING_MODES = ["PERCENTAGE", "VALUE_PERCENTAGE", "FLAT_TIER", "VEHICLE_SEATS_BASED"];

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
  // Only meaningful (and only saved) when pricing_mode is VEHICLE_SEATS_BASED
  // — the excess-of-value bracket charge for this coverage at this period:
  // no premium is owed up to threshold_amount; the excess above it is split
  // into exceed_threshold_amount-sized brackets, each charged
  // exceed_threshold_price (see lib/coveragePricing.js's resolveCoverageRows).
  // All three are "one scalar per period" shapes, same as standard_rate
  // above, and always sent together. The tier menu itself (insured amount
  // per occupant) is a separate replace-all list — see updateSeatTiersSchema
  // below.
  threshold_amount: z.coerce.number({ error: "threshold_amount must be zero or greater" }).nonnegative().optional(),
  exceed_threshold_amount: z.coerce.number({ error: "exceed_threshold_amount must be greater than zero" }).positive().optional(),
  exceed_threshold_price: z.coerce.number({ error: "exceed_threshold_price must be zero or greater" }).nonnegative().optional(),
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

// VEHICLE_SEATS_BASED mode's own tier menu — "Insured amount for each
// occupant" options. coverage_amount on the resulting line is
// no_of_seats * insured_amount_per_occupant; the premium floor is computed
// off that total against the coverage's shared threshold_amount/
// exceed_threshold_amount/exceed_threshold_price (see
// updatePricingModeSchema above) — no per-tier rate any more.
const seatTierSchema = z.object({
  insured_amount_per_occupant: z.coerce.number({ error: "insured_amount_per_occupant is required" }).positive(),
});

const updateSeatTiersSchema = z.object({
  coverage_in_days: coverageInDaysField,
  tiers: z.array(seatTierSchema),
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
  updateSeatTiersSchema,
  createAllowablePeriodSchema,
};
