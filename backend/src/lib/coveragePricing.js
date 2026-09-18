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
// grossTargetCoverageId/targetGrossAmount/miscFee together drive the
// "Solve from Gross Total" pricing mode (see the gross-solve pass at the
// bottom of this function) — every other coverage prices/floors exactly as
// before; omit targetGrossAmount (the default) and this function behaves
// identically to before that mode existed.
async function resolveCoverageRows({
  coverages,
  className,
  vehicles,
  vehicleValues,
  addressValue,
  agentId,
  startAt,
  endAt,
  targetGrossAmount,
  miscFee,
  grossTargetCoverageId,
}) {
  // An individual agent linked to a company (Agent.company_id) prices off
  // that company's own AgentNetrate/AgentValuePercentageTier/
  // AgentFlatTierPricing rows, not their own (now-dormant) ones — see
  // Agent.company_id's own comment in schema/parties.prisma. Resolved once
  // here, in the one place every agent-override lookup below reads from,
  // rather than asking each call site (policyApplications.js/
  // policyQuotations.js) to remember to do it themselves.
  const callerAgent = await prisma.agent.findUnique({ where: { id: agentId }, select: { company_id: true } });
  const effectiveAgentId = callerAgent?.company_id || agentId;

  const coverageIds = coverages.map((c) => c.coverage_id);
  const coverageDetails = await prisma.productCoverage.findMany({
    where: { id: { in: coverageIds } },
    select: {
      id: true,
      coverage_name: true,
      maximum_coverage: true,
      pricing_mode: true,
      // Whether this coverage's own premium folds into the Miscellaneous
      // charge instead of the Premium total — see routes/policyApplications.js's/
      // routes/policyQuotations.js's own split of resolvedRows by this flag.
      is_misc: true,
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
        where: { agent_id: effectiveAgentId },
        select: { netrate: true, maximum_coverage: true },
      },
      agent_value_percentage_tiers: { where: { agent_id: effectiveAgentId } },
      agent_flat_tier_prices: { where: { agent_id: effectiveAgentId } },
      seats_based_pricing: {
        select: { threshold_amount: true, exceed_threshold_amount: true, exceed_threshold_price: true },
      },
      agent_seats_based_pricing: {
        where: { agent_id: effectiveAgentId },
        select: { threshold_amount: true, exceed_threshold_amount: true, exceed_threshold_price: true },
      },
      seats_tier_prices: true,
      agent_seats_tier_prices: { where: { agent_id: effectiveAgentId } },
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
      // While solving this exact coverage's premium backward from a target
      // gross total, its own floor is still computed per vehicle below (the
      // gross-solve pass at the bottom of this function needs it), but the
      // agent-entered premiumAmount is a placeholder at this point — it's
      // about to be overwritten, so the ordinary "never below floor" check
      // has to be skipped for it here rather than possibly rejecting a
      // placeholder that was never meant to be charged.
      const isGrossSolveTarget = targetGrossAmount != null && c.coverage_id === grossTargetCoverageId;
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
        if (!isGrossSolveTarget && round2(premiumAmount) < payableToBethel) {
          throw new HttpError(400, belowBethelError(coverage.coverage_name, payableToBethel));
        }
        resolvedRows.push({
          coverage_id: c.coverage_id,
          coverage_amount: round2(targetValue),
          premium_amount: round2(premiumAmount),
          payable_to_bethel: payableToBethel,
          applied_rate: rate,
          vehicle_index: vehicleIndex,
          is_misc: coverage.is_misc,
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
      // FLAT_TIER is "no computation, no agent margin" by design (see
      // CoverageTierBasedPricing's own schema comment) — the tier's own
      // coverage_price IS the premium, always, regardless of whatever the
      // client sent for premium_amount (unlike every other pricing mode,
      // which only floors the agent-entered premium at payable_to_bethel).
      for (const vehicleIndex of targetIndices) {
        resolvedRows.push({
          coverage_id: c.coverage_id,
          coverage_amount: round2(Number(tier.coverage_amount)),
          premium_amount: payableToBethel,
          payable_to_bethel: payableToBethel,
          applied_rate: 0,
          vehicle_index: vehicleIndex,
          is_misc: coverage.is_misc,
        });
      }
      continue;
    }

    if (coverage.pricing_mode === "VEHICLE_SEATS_BASED") {
      const seatsPricing = period.agent_seats_based_pricing[0] || period.seats_based_pricing;
      if (!seatsPricing) {
        throw new HttpError(400, `No pricing threshold is configured for ${coverage.coverage_name}`);
      }
      const thresholdAmount = Number(seatsPricing.threshold_amount);
      const exceedThresholdAmount = Number(seatsPricing.exceed_threshold_amount);
      const exceedThresholdPrice = Number(seatsPricing.exceed_threshold_price);
      // c.coverage_amount is the agent's chosen "insured amount for each
      // occupant" — the tier key, same convention as FLAT_TIER's own
      // coverage_amount — not the final total insured value (that's seats *
      // this amount, computed per targeted vehicle below).
      const seatTiers = period.agent_seats_tier_prices.length > 0
        ? period.agent_seats_tier_prices
        : period.seats_tier_prices;
      const tier = seatTiers.find((t) => Number(t.insured_amount_per_occupant) === c.coverage_amount);
      if (!tier) {
        throw new HttpError(400, `Insured amount per occupant for ${coverage.coverage_name} does not match one of its available tiers`);
      }
      for (const vehicleIndex of targetIndices) {
        if (vehicleIndex === null) {
          throw new HttpError(400, `${coverage.coverage_name} requires a vehicle to price by seat count`);
        }
        const seats = Number(vehicles[vehicleIndex]?.no_of_seats);
        if (!Number.isFinite(seats) || seats <= 0) {
          throw new HttpError(400, `${coverage.coverage_name} requires a valid seat count for the targeted vehicle`);
        }
        // Total insured value for this vehicle under the picked tier — no
        // charge up to thresholdAmount; the excess above it is split into
        // exceedThresholdAmount-sized brackets, each charged
        // exceedThresholdPrice (e.g. a ₱700,000 insured amount against a
        // ₱350,000 threshold, ₱50,000 brackets and ₱50/bracket floors the
        // premium at (350,000 / 50,000) * 50 = ₱350).
        const insuredValue = seats * Number(tier.insured_amount_per_occupant);
        const excessValue = Math.max(0, insuredValue - thresholdAmount);
        const brackets = exceedThresholdAmount > 0 ? excessValue / exceedThresholdAmount : 0;
        const payableToBethel = round2(brackets * exceedThresholdPrice);
        if (round2(premiumAmount) < payableToBethel) {
          throw new HttpError(400, belowBethelError(coverage.coverage_name, payableToBethel));
        }
        resolvedRows.push({
          coverage_id: c.coverage_id,
          coverage_amount: round2(insuredValue),
          premium_amount: round2(premiumAmount),
          payable_to_bethel: payableToBethel,
          applied_rate: exceedThresholdPrice,
          vehicle_index: vehicleIndex,
          is_misc: coverage.is_misc,
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
        is_misc: coverage.is_misc,
      });
    }
  }

  // "Solve from Gross Total" — instead of the agent entering
  // grossTargetCoverageId's own premium directly, they enter the whole
  // filing's target GRAND TOTAL (Premium + Doc. Stamps + V.A.T. + L.G.T. +
  // Miscellaneous) and this coverage's premium is solved backward so the
  // totals come out to exactly that. Every other selected coverage's premium
  // was already resolved normally above and is left untouched here.
  //
  // The grand total is always S * (1 + DOC_STAMPS_RATE + VAT_RATE + LGT_RATE)
  // + miscFee, where S is the sum of every resolved row's premium_amount
  // regardless of is_misc (see computeChargeTotals below for why — is_misc
  // only moves which bucket a premium displays under, never what it's
  // taxed against, and the "moved" amount is folded back into misc exactly
  // once). Solving for this one coverage's own contribution to S:
  //   requiredTargetAggregate = (targetGrossAmount - miscFee) / combinedRate - fixedSum
  // where fixedSum is every other row's premium and combinedRate is
  // 1 + DOC_STAMPS_RATE + VAT_RATE + LGT_RATE.
  //
  // Every row this coverage resolved to (one per targeted vehicle, or a
  // single one for Property) charges the exact same premium — the schema
  // only ever carries one premium_amount per coverage selection, applied
  // identically to every vehicle it targets, same convention every other
  // pricing mode already follows — so the aggregate is split evenly across
  // however many rows there are, then floor-checked against the highest of
  // those rows' own payable_to_bethel (the same "one premium has to clear
  // every targeted vehicle's floor" rule the ordinary per-coverage check
  // enforces one row at a time).
  if (targetGrossAmount != null) {
    if (!grossTargetCoverageId) {
      throw new HttpError(
        400,
        "This product variant has no Gross Target Coverage configured — set one under Manage Products before solving from a target gross total."
      );
    }
    const targetRows = resolvedRows.filter((r) => r.coverage_id === grossTargetCoverageId);
    if (targetRows.length === 0) {
      throw new HttpError(
        400,
        "The gross target coverage must be among the selected coverages to solve from a target gross total."
      );
    }
    const fixedSum = round2(
      resolvedRows.filter((r) => r.coverage_id !== grossTargetCoverageId).reduce((sum, r) => sum + r.premium_amount, 0)
    );
    const combinedRate = 1 + DOC_STAMPS_RATE + VAT_RATE + LGT_RATE;
    const requiredGrossPremiumSum = round2((targetGrossAmount - (Number(miscFee) || 0)) / combinedRate);
    const requiredTargetAggregate = round2(requiredGrossPremiumSum - fixedSum);
    const premiumPerRow = round2(requiredTargetAggregate / targetRows.length);
    const maxFloor = Math.max(...targetRows.map((r) => r.payable_to_bethel));
    if (premiumPerRow < maxFloor) {
      throw new HttpError(
        400,
        `Target gross total of ₱${targetGrossAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} is too low — once the other selected coverages and taxes/miscellaneous are accounted for, only ₱${premiumPerRow.toLocaleString(undefined, { maximumFractionDigits: 2 })} is left for the gross target coverage, below the ₱${maxFloor.toLocaleString(undefined, { maximumFractionDigits: 2 })} payable to Bethel for it. Increase the target gross total or reduce other coverages' premiums.`
      );
    }
    for (const row of targetRows) {
      row.premium_amount = premiumPerRow;
    }
  }

  return resolvedRows;
}

const DOC_STAMPS_RATE = 0.125;
const VAT_RATE = 0.12;
const LGT_RATE = 0.002;

// Same total_premium/doc_stamps/vat/lgt/misc split routes/policyApplications.js
// and routes/policyQuotations.js each compute inline off a fresh
// resolveCoverageRows() result — pulled out here (rather than also inlined a
// third time) specifically for routes/endorsements.js's POST /:id/approve,
// which has to recompute a Policy's own charge totals from its current set of
// PolicyCoverage rows after an ADD_COVERAGE/REMOVE_CLAUSE line changes that
// set, not from a one-shot resolveCoverageRows() call. `rows` is anything
// carrying { premium_amount, is_misc } — a resolveCoverageRows() row or a
// PolicyCoverage row alike.
function computeChargeTotals(rows, miscFee) {
  const grossPremium = round2(rows.reduce((sum, r) => sum + Number(r.premium_amount), 0));
  const totalPremium = round2(
    rows.filter((r) => !r.is_misc).reduce((sum, r) => sum + Number(r.premium_amount), 0)
  );
  const miscFromCoverages = round2(grossPremium - totalPremium);
  const docStamps = round2(grossPremium * DOC_STAMPS_RATE);
  const vat = round2(grossPremium * VAT_RATE);
  const lgt = round2(grossPremium * LGT_RATE);
  const misc = round2((Number(miscFee) || 0) + miscFromCoverages);
  return { totalPremium, docStamps, vat, lgt, misc };
}

// Every FLAT_TIER or VEHICLE_SEATS_BASED coverage on this product variant
// that's actually priced for the chosen coverage period (has a
// coverage-level or this agent's own override tier/threshold configured) —
// exactly the set the intake forms show under their own "Required
// Coverages" subheading. Both pricing modes are mandatory on every
// application/quotation (see PolicyApplication.jsx's own note) rather than
// an optional checkbox — FLAT_TIER with no agent margin at all (see
// resolveCoverageRows's own FLAT_TIER branch above), VEHICLE_SEATS_BASED
// still letting the agent type/mark up their own premium the same as
// PERCENTAGE always has — so routes/policyApplications.js/
// routes/policyQuotations.js call this right after resolving the product
// variant/coverage period and 400 if any of these ids is missing from the
// submitted coverages array. A coverage with nothing configured for this
// period isn't "required" (it isn't even selectable) — same has_pricing
// gate GET /product-catalog already applies (mirrored here exactly: a
// VEHICLE_SEATS_BASED coverage needs both its threshold scalar AND its tier
// menu, not just one).
async function getRequiredCoverageIds({ productVariantId, coveragePeriodDays, agentId }) {
  const callerAgent = await prisma.agent.findUnique({ where: { id: agentId }, select: { company_id: true } });
  const effectiveAgentId = callerAgent?.company_id || agentId;

  const coverages = await prisma.productCoverage.findMany({
    where: {
      product_variant_id: productVariantId,
      status: "ACTIVE",
      pricing_mode: { in: ["FLAT_TIER", "VEHICLE_SEATS_BASED"] },
    },
    select: {
      id: true,
      coverage_name: true,
      pricing_mode: true,
      allowable_periods: {
        where: { coverage_in_days: coveragePeriodDays },
        select: {
          tier_based_prices: { select: { id: true } },
          agent_flat_tier_prices: { where: { agent_id: effectiveAgentId }, select: { id: true } },
          seats_based_pricing: { select: { id: true } },
          agent_seats_based_pricing: { where: { agent_id: effectiveAgentId }, select: { id: true } },
          seats_tier_prices: { select: { id: true } },
          agent_seats_tier_prices: { where: { agent_id: effectiveAgentId }, select: { id: true } },
        },
      },
    },
  });

  return coverages
    .filter((c) => {
      const period = c.allowable_periods[0];
      if (!period) return false;
      if (c.pricing_mode === "FLAT_TIER") {
        return period.tier_based_prices.length > 0 || period.agent_flat_tier_prices.length > 0;
      }
      // seats_based_pricing is a 1:1 relation on CoverageAllowablePeriod
      // (an object or null), unlike agent_seats_based_pricing which is
      // queried here as a where-filtered to-many (at most one row, but
      // still an array) — same shape distinction catalog.js's own
      // `p.agent_seats_based_pricing[0] || p.seats_based_pricing` already relies on.
      const hasThreshold = Boolean(period.seats_based_pricing) || period.agent_seats_based_pricing.length > 0;
      const hasTiers = period.seats_tier_prices.length > 0 || period.agent_seats_tier_prices.length > 0;
      return hasThreshold && hasTiers;
    })
    .map((c) => ({ id: c.id, coverage_name: c.coverage_name }));
}

module.exports = {
  round2,
  resolveCoverageRows,
  computeChargeTotals,
  getRequiredCoverageIds,
  DOC_STAMPS_RATE,
  VAT_RATE,
  LGT_RATE,
};
