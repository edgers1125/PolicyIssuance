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
  // — the single default seat threshold for this coverage at this period,
  // same "one scalar per period" shape as standard_rate above. The tier menu
  // itself (insured-amount-per-occupant + rate) is a separate replace-all
  // list — see updateSeatTiersSchema below.
  threshold_seats: z.coerce.number({ error: "threshold_seats must be zero or greater" }).int().nonnegative().optional(),
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
// occupant" options, each with its own per-excess-seat rate. coverage_amount
// on the resulting line is no_of_seats * insured_amount_per_occupant; the
// premium floor is (no_of_seats - threshold_seats) * this tier's own
// rate_per_excess_seat.
const seatTierSchema = z.object({
  insured_amount_per_occupant: z.coerce.number({ error: "insured_amount_per_occupant is required" }).positive(),
  rate_per_excess_seat: z.coerce.number({ error: "rate_per_excess_seat is required" }).nonnegative(),
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
