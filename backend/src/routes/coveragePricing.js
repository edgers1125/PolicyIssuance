const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requireAnyPermission } = require("../middleware/permissions");
const { validateBody, validateQuery } = require("../middleware/validate");
const {
  getPricingQuerySchema,
  updatePricingModeSchema,
  updateValuePercentageTiersSchema,
  updateFlatTiersSchema,
  updateSeatTiersSchema,
  createAllowablePeriodSchema,
} = require("../schemas/coveragePricing");

const router = express.Router();

// Deliberately NOT a router-wide router.use(): this router is mounted at the
// app root ("/") alongside catalogRouter, so a path-less router.use() here
// would run for every request that reaches it — including ones meant for
// routes registered later in index.js (e.g. /me, /policy-applications) — and
// 403 them for lacking this permission even though they have nothing to do
// with coverage pricing. Each route below takes the auth/permission checks
// as its own middleware instead, so they only ever apply to these 4 routes.
// Either the standalone Manage Coverage Pricing page's permission or Manage
// Products' own EDIT_PRICING sub-permission unlocks these — the same pricing
// editor is embedded in both places (see components/CoveragePricingEditor.jsx).
const guard = [
  requireAuth,
  requireAnyPermission(["MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING", "MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_PRICING"]),
];

async function findCoverageOr404(res, id) {
  const coverage = await prisma.productCoverage.findUnique({ where: { id } });
  if (!coverage) {
    res.status(404).json({ error: "Coverage not found" });
    return null;
  }
  return coverage;
}

// Every pricing table below is scoped to one of the coverage's own allowable
// periods (CoverageAllowablePeriod) — resolves the period row for the given
// day count, 400ing if this coverage isn't actually offered at that period
// rather than silently creating pricing for a period nothing can select.
async function findAllowablePeriodOr400(res, coverageId, coverageInDays) {
  const period = await prisma.coverageAllowablePeriod.findUnique({
    where: { coverage_id_coverage_in_days: { coverage_id: coverageId, coverage_in_days: coverageInDays } },
  });
  if (!period) {
    res.status(400).json({ error: `This coverage is not offered for a ${coverageInDays}-day period` });
    return null;
  }
  return period;
}

// Adds a new allowable period to a coverage — surfaced from the Manage
// Coverage Pricing page's period picker when the admin types a day count
// that isn't already one of this coverage's options. A brand-new period
// starts with no pricing configured; the admin fills that in next, the same
// as they would for any other period.
router.post(
  "/coverages/:id/allowable-periods",
  ...guard,
  validateBody(createAllowablePeriodSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const coverage = await findCoverageOr404(res, id);
      if (!coverage) return;

      const { coverage_in_days } = req.body;
      const existing = await prisma.coverageAllowablePeriod.findUnique({
        where: { coverage_id_coverage_in_days: { coverage_id: id, coverage_in_days } },
      });
      if (existing) {
        return res.status(400).json({ error: `This coverage already has a ${coverage_in_days}-day period` });
      }

      const period = await prisma.coverageAllowablePeriod.create({
        data: { coverage_id: id, coverage_in_days },
      });
      res.status(201).json(period);
    } catch (err) {
      next(err);
    }
  }
);

// Removing an allowable period is a staged action from Manage Products'
// period chips (mark for deletion, then Save) — see
// PATCH /manage-products/batch-delete in routes/catalog.js, which handles
// periods alongside class/variant/coverage deletions in one transaction so
// a whole batch of pending deletions across every tier commits as one request.

router.get("/coverages/:id/pricing", ...guard, validateQuery(getPricingQuerySchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const coverage = await findCoverageOr404(res, id);
    if (!coverage) return;

    const { coverage_in_days } = req.query;
    const period = await findAllowablePeriodOr400(res, id, coverage_in_days);
    if (!period) return;

    const [valuePercentageTiers, flatTiers, percentagePricing, seatsBasedPricing, seatTiers] = await Promise.all([
      prisma.coverageValuePercentageTier.findMany({
        where: { coverage_allowable_period_id: period.id },
        orderBy: { min_value: "asc" },
      }),
      prisma.coverageTierBasedPricing.findMany({
        where: { coverage_allowable_period_id: period.id },
        orderBy: { coverage_amount: "asc" },
      }),
      prisma.coveragePercentageBasedPricing.findUnique({
        where: { coverage_allowable_period_id: period.id },
      }),
      prisma.coverageSeatsBasedPricing.findUnique({
        where: { coverage_allowable_period_id: period.id },
      }),
      prisma.coverageSeatsTierPricing.findMany({
        where: { coverage_allowable_period_id: period.id },
        orderBy: { insured_amount_per_occupant: "asc" },
      }),
    ]);

    res.json({
      pricing_mode: coverage.pricing_mode,
      standard_rate: percentagePricing?.standard_rate ?? null,
      value_percentage_tiers: valuePercentageTiers,
      tier_based_prices: flatTiers,
      threshold_seats: seatsBasedPricing?.threshold_seats ?? null,
      seat_tier_prices: seatTiers,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/coverages/:id/pricing", ...guard, validateBody(updatePricingModeSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const coverage = await findCoverageOr404(res, id);
    if (!coverage) return;

    const { pricing_mode, coverage_in_days, standard_rate, threshold_seats } = req.body;
    const period = await findAllowablePeriodOr400(res, id, coverage_in_days);
    if (!period) return;

    // pricing_mode is coverage-wide — a coverage can't use a different
    // pricing scheme for one period vs another, only a different rate/tiers
    // within whichever scheme it uses.
    const updated = await prisma.productCoverage.update({
      where: { id },
      data: { pricing_mode },
    });

    if (pricing_mode === "PERCENTAGE" && standard_rate !== undefined) {
      await prisma.coveragePercentageBasedPricing.upsert({
        where: { coverage_allowable_period_id: period.id },
        update: { standard_rate },
        create: { coverage_allowable_period_id: period.id, standard_rate },
      });
    }

    if (pricing_mode === "VEHICLE_SEATS_BASED" && threshold_seats !== undefined) {
      await prisma.coverageSeatsBasedPricing.upsert({
        where: { coverage_allowable_period_id: period.id },
        update: { threshold_seats },
        create: { coverage_allowable_period_id: period.id, threshold_seats },
      });
    }

    res.json({ pricing_mode: updated.pricing_mode });
  } catch (err) {
    next(err);
  }
});

// Replaces this coverage's entire value-percentage tier set for one allowable
// period — same replace-all pattern used for an agent's netrates, just
// scoped to a single (coverage, period) pair so saving one period's tiers
// never touches another period's.
router.put(
  "/coverages/:id/value-percentage-tiers",
  ...guard,
  validateBody(updateValuePercentageTiersSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const coverage = await findCoverageOr404(res, id);
      if (!coverage) return;

      const { coverage_in_days, tiers } = req.body;
      const period = await findAllowablePeriodOr400(res, id, coverage_in_days);
      if (!period) return;

      const minValues = tiers.map((t) => t.min_value);
      if (new Set(minValues).size !== minValues.length) {
        return res.status(400).json({ error: "Each tier needs a distinct min_value" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.coverageValuePercentageTier.deleteMany({
          where: { coverage_allowable_period_id: period.id },
        });
        if (tiers.length > 0) {
          await tx.coverageValuePercentageTier.createMany({
            data: tiers.map((t) => ({
              coverage_allowable_period_id: period.id,
              min_value: t.min_value,
              rate_percentage: t.rate_percentage,
            })),
          });
        }
      });

      res.json({ message: "Value percentage tiers updated" });
    } catch (err) {
      next(err);
    }
  }
);

// Replaces this coverage's entire flat-tier set for one allowable period.
router.put(
  "/coverages/:id/flat-tiers",
  ...guard,
  validateBody(updateFlatTiersSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const coverage = await findCoverageOr404(res, id);
      if (!coverage) return;

      const { coverage_in_days, tiers } = req.body;
      const period = await findAllowablePeriodOr400(res, id, coverage_in_days);
      if (!period) return;

      const amounts = tiers.map((t) => t.coverage_amount);
      if (new Set(amounts).size !== amounts.length) {
        return res.status(400).json({ error: "Each tier needs a distinct coverage_amount" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.coverageTierBasedPricing.deleteMany({
          where: { coverage_allowable_period_id: period.id },
        });
        if (tiers.length > 0) {
          await tx.coverageTierBasedPricing.createMany({
            data: tiers.map((t) => ({
              coverage_allowable_period_id: period.id,
              coverage_amount: t.coverage_amount,
              coverage_price: t.coverage_price,
            })),
          });
        }
      });

      res.json({ message: "Flat tiers updated" });
    } catch (err) {
      next(err);
    }
  }
);

// Replaces this coverage's entire VEHICLE_SEATS_BASED tier menu ("Insured
// amount for each occupant" options) for one allowable period — same
// replace-all pattern as the flat-tier route above, just keyed by
// insured_amount_per_occupant instead of coverage_amount.
router.put(
  "/coverages/:id/seats-tiers",
  ...guard,
  validateBody(updateSeatTiersSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const coverage = await findCoverageOr404(res, id);
      if (!coverage) return;

      const { coverage_in_days, tiers } = req.body;
      const period = await findAllowablePeriodOr400(res, id, coverage_in_days);
      if (!period) return;

      const amounts = tiers.map((t) => t.insured_amount_per_occupant);
      if (new Set(amounts).size !== amounts.length) {
        return res.status(400).json({ error: "Each tier needs a distinct insured_amount_per_occupant" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.coverageSeatsTierPricing.deleteMany({
          where: { coverage_allowable_period_id: period.id },
        });
        if (tiers.length > 0) {
          await tx.coverageSeatsTierPricing.createMany({
            data: tiers.map((t) => ({
              coverage_allowable_period_id: period.id,
              insured_amount_per_occupant: t.insured_amount_per_occupant,
              rate_per_excess_seat: t.rate_per_excess_seat,
            })),
          });
        }
      });

      res.json({ message: "Seat tiers updated" });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
