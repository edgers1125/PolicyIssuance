// Shared coverage pricing/period resolution — used identically by both
// PolicyApplication and PolicyQuotation creation, since a quotation prices
// coverages exactly the same way an application does (same floor-price
// enforcement against what's payable to Bethel, same period matching); the
// two only ever diverge on payment fields and which tables the result is
// written into.
const prisma = require("./prisma");
const { HttpError } = require("./httpError");
const { findApplicableValueTier } = require("./vehicleValue");

function round2(n) {
  return Math.round(n * 100) / 100;
}

function belowBethelError(coverageName, payableToBethel) {
  return {
    error: `Premium amount for ${coverageName} is below the amount payable to Bethel of ₱${payableToBethel.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
  };
}

// Resolves every selected coverage into one row per (coverage, targeted
// vehicle), enforcing everything that has to hold regardless of whether the
// result becomes an ApplicationCoverage or a QuotationCoverage:
//  - every coverage exists and is actually offered at the application/
//    quotation's single shared coverage period (coveragePeriodDays, derived
//    by the caller from its own coverage_start_at/coverage_end_at)
//  - vehicle_indices (Motor only) actually name vehicles on this application
//  - VALUE_PERCENTAGE/FLAT_TIER price fully automatically off the coverage's
//    (or this agent's override) tiers for that period
//  - PERCENTAGE's agent-entered premium never comes in under payable_to_bethel
// Throws HttpError for any of the above; never touches `res` itself so it
// can be shared between routes with different response shapes.
async function resolveCoverageRows({ coverages, className, vehicles, vehicleValues, addressValue, agentId, startAt, endAt }) {
  const coverageIds = coverages.map((c) => c.coverage_id);
  const coverageDetails = await prisma.productCoverage.findMany({
    where: { id: { in: coverageIds } },
    select: {
      id: true,
      coverage_name: true,
      maximum_coverage: true,
      pricing_mode: true,
      allowable_periods: { select: { coverage_in_days: true } },
    },
  });
  const coverageById = new Map(coverageDetails.map((c) => [c.id, c]));
  if (coverageDetails.length !== new Set(coverageIds).size) {
    throw new HttpError(400, "One or more coverages do not exist");
  }

  // The whole application/quotation shares a single coverage_start_at/
  // coverage_end_at pair — the schema already confirmed endAt is
  // start-plus-whole-days, so every selected coverage has to actually be
  // offered at that exact day count, never trusted from client-side filtering.
  const coveragePeriodDays = Math.round((endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000));
  for (const c of coverages) {
    const coverage = coverageById.get(c.coverage_id);
    const allowedDays = coverage.allowable_periods.map((p) => p.coverage_in_days);
    if (!allowedDays.includes(coveragePeriodDays)) {
      throw new HttpError(400, `${coverage.coverage_name} is not offered for a ${coveragePeriodDays}-day coverage period`);
    }
  }

  // Every pricing table (the coverage's own default, and this agent's
  // override of it) hangs off the specific CoverageAllowablePeriod row for
  // (coverage, coveragePeriodDays) rather than the coverage directly.
  const periodsAtChosenLength = await prisma.coverageAllowablePeriod.findMany({
    where: { coverage_id: { in: coverageIds }, coverage_in_days: coveragePeriodDays },
    select: {
      coverage_id: true,
      percentage_pricing: { select: { standard_rate: true } },
      value_percentage_tiers: true,
      tier_based_prices: true,
      agent_netrates: {
        where: { agent_id: agentId },
        select: { netrate: true, maximum_coverage: true },
      },
      agent_value_percentage_tiers: { where: { agent_id: agentId } },
      agent_flat_tier_prices: { where: { agent_id: agentId } },
    },
  });
  const periodByCoverageId = new Map(periodsAtChosenLength.map((p) => [p.coverage_id, p]));

  // A coverage's vehicle_indices are positions in the `vehicles` array, not
  // real vehicle ids — the vehicles they name might not exist in the
  // database yet (they're created inside the caller's own transaction).
  for (const c of coverages) {
    if (c.vehicle_indices == null) continue;
    if (className !== "Motor" || c.vehicle_indices.some((i) => i >= vehicles.length)) {
      throw new HttpError(400, "vehicle_indices does not match any vehicle on this application");
    }
  }

  // One entry per (coverage, targeted vehicle). Every pricing mode works the
  // same way: the server resolves what's actually owed to Bethel for the row
  // (payable_to_bethel), and the agent's own premium_amount is whatever they
  // want to charge, never trusted below that floor.
  const resolvedRows = [];

  for (const c of coverages) {
    const coverage = coverageById.get(c.coverage_id);
    const targetIndices = className === "Motor" ? (c.vehicle_indices ?? vehicles.map((_, i) => i)) : [null];
    const premiumAmount = c.premium_amount;
    // Guaranteed present — every c.coverage_id already passed the
    // allowable-period check above, which only succeeds when a
    // CoverageAllowablePeriod (and therefore this lookup) exists.
    const period = periodByCoverageId.get(c.coverage_id);

    if (coverage.pricing_mode === "VALUE_PERCENTAGE") {
      const valueTiers = period.agent_value_percentage_tiers.length > 0
        ? period.agent_value_percentage_tiers
        : period.value_percentage_tiers;
      for (const vehicleIndex of targetIndices) {
        // Motor prices off the targeted vehicle's own (depreciated) value;
        // any other class (Property) has no vehicles at all, so it prices
        // off the application/quotation's risk address value instead.
        const targetValue = vehicleIndex !== null ? vehicleValues[vehicleIndex] : addressValue;
        if (targetValue === null || targetValue === undefined) {
          throw new HttpError(
            400,
            vehicleIndex !== null
              ? `${coverage.coverage_name} is priced from the vehicle's estimated value, which hasn't been assessed yet`
              : `${coverage.coverage_name} is priced from the risk address's estimated value, which hasn't been assessed yet`
          );
        }
        const tier = findApplicableValueTier(valueTiers, targetValue);
        if (!tier) {
          throw new HttpError(400, `No pricing tier is configured for ${coverage.coverage_name} at this vehicle's current value`);
        }
        const rate = Number(tier.rate_percentage) / 100;
        const payableToBethel = round2(targetValue * rate);
        if (round2(premiumAmount) < payableToBethel) {
          throw new HttpError(400, belowBethelError(coverage.coverage_name, payableToBethel));
        }
        resolvedRows.push({
          coverage_id: c.coverage_id,
          coverage_amount: round2(targetValue),
          premium_amount: round2(premiumAmount),
          payable_to_bethel: payableToBethel,
          applied_rate: rate,
          vehicle_index: vehicleIndex,
        });
      }
      continue;
    }

    if (coverage.pricing_mode === "FLAT_TIER") {
      const flatTiers = period.agent_flat_tier_prices.length > 0
        ? period.agent_flat_tier_prices
        : period.tier_based_prices;
      const tier = flatTiers.find((t) => Number(t.coverage_amount) === c.coverage_amount);
      if (!tier) {
        throw new HttpError(400, `coverage_amount for ${coverage.coverage_name} does not match one of its available tiers`);
      }
      const payableToBethel = round2(Number(tier.coverage_price));
      if (round2(premiumAmount) < payableToBethel) {
        throw new HttpError(400, belowBethelError(coverage.coverage_name, payableToBethel));
      }
      for (const vehicleIndex of targetIndices) {
        resolvedRows.push({
          coverage_id: c.coverage_id,
          coverage_amount: round2(Number(tier.coverage_amount)),
          premium_amount: round2(premiumAmount),
          payable_to_bethel: payableToBethel,
          applied_rate: 0,
          vehicle_index: vehicleIndex,
        });
      }
      continue;
    }

    // PERCENTAGE — the agent's per-vehicle coverage_amount, validated
    // against the per-vehicle max, then applied to every targeted vehicle
    // as its own row.
    const override = period.agent_netrates[0];
    if (!override && !period.percentage_pricing) {
      throw new HttpError(400, `No standard rate is configured for ${coverage.coverage_name}`);
    }
    const effectiveRate = override ? Number(override.netrate) : Number(period.percentage_pricing.standard_rate);
    const effectiveMax =
      override && override.maximum_coverage !== null ? Number(override.maximum_coverage) : Number(coverage.maximum_coverage);

    const coverageAmount = c.coverage_amount;

    if (coverageAmount > effectiveMax) {
      throw new HttpError(400, `Coverage amount for ${coverage.coverage_name} exceeds the maximum of ₱${effectiveMax.toLocaleString()}`);
    }
    const payableToBethel = round2(coverageAmount * effectiveRate);
    if (round2(premiumAmount) < payableToBethel) {
      throw new HttpError(400, belowBethelError(coverage.coverage_name, payableToBethel));
    }
    for (const vehicleIndex of targetIndices) {
      resolvedRows.push({
        coverage_id: c.coverage_id,
        coverage_amount: round2(coverageAmount),
        premium_amount: round2(premiumAmount),
        payable_to_bethel: payableToBethel,
        applied_rate: effectiveRate,
        vehicle_index: vehicleIndex,
      });
    }
  }

  return resolvedRows;
}

module.exports = { round2, resolveCoverageRows };
