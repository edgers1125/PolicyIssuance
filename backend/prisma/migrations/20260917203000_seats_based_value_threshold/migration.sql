-- VEHICLE_SEATS_BASED's premium floor no longer keys off seat count at all
-- (threshold_seats / rate_per_excess_seat) — coverage_amount is still
-- no_of_seats * the agent-picked insured_amount_per_occupant tier, but the
-- floor is now an excess-of-VALUE bracket charge against that same insured
-- amount: nothing is charged up to threshold_amount, and the excess above it
-- is split into exceed_threshold_amount-sized brackets, each charged
-- exceed_threshold_price (see lib/coveragePricing.js's resolveCoverageRows).
-- Only one CoverageSeatsBasedPricing row exists at all today (this pricing
-- mode is still dev/testing-only, per the migration that first added it) —
-- backfilled with the exact figures used to configure it (a ₱350,000
-- threshold, ₱50,000 brackets, ₱50/bracket) rather than left holding a
-- stale seat-count number reinterpreted as pesos.

ALTER TABLE "CoverageSeatsBasedPricing" RENAME COLUMN "threshold_seats" TO "threshold_amount";
ALTER TABLE "CoverageSeatsBasedPricing" ALTER COLUMN "threshold_amount" TYPE DECIMAL(18,2);
ALTER TABLE "CoverageSeatsBasedPricing" ADD COLUMN "exceed_threshold_amount" DECIMAL(18,2);
ALTER TABLE "CoverageSeatsBasedPricing" ADD COLUMN "exceed_threshold_price" DECIMAL(10,2);
UPDATE "CoverageSeatsBasedPricing" SET "threshold_amount" = 350000, "exceed_threshold_amount" = 50000, "exceed_threshold_price" = 50;
ALTER TABLE "CoverageSeatsBasedPricing" ALTER COLUMN "exceed_threshold_amount" SET NOT NULL;
ALTER TABLE "CoverageSeatsBasedPricing" ALTER COLUMN "exceed_threshold_price" SET NOT NULL;

-- AgentSeatsBasedPricing has no rows on file yet (no agent override of this
-- mode has ever been saved), so the equivalent rename/retype needs no
-- backfill step.
ALTER TABLE "AgentSeatsBasedPricing" RENAME COLUMN "threshold_seats" TO "threshold_amount";
ALTER TABLE "AgentSeatsBasedPricing" ALTER COLUMN "threshold_amount" TYPE DECIMAL(18,2);
ALTER TABLE "AgentSeatsBasedPricing" ADD COLUMN "exceed_threshold_amount" DECIMAL(18,2) NOT NULL;
ALTER TABLE "AgentSeatsBasedPricing" ADD COLUMN "exceed_threshold_price" DECIMAL(10,2) NOT NULL;

-- The tier menu (insured_amount_per_occupant) no longer carries its own
-- per-tier rate — the excess-of-value bracket charge above is one shared
-- default/override, not tiered by insured amount per occupant.
ALTER TABLE "CoverageSeatsTierPricing" DROP COLUMN "rate_per_excess_seat";
ALTER TABLE "AgentSeatsTierPricing" DROP COLUMN "rate_per_excess_seat";
