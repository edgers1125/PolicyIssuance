const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateBody } = require("../middleware/validate");
const {
  updatePricingModeSchema,
  updateValuePercentageTiersSchema,
  updateFlatTiersSchema,
} = require("../schemas/coveragePricing");

const router = express.Router();

// Deliberately NOT a router-wide router.use(): this router is mounted at the
// app root ("/") alongside catalogRouter, so a path-less router.use() here
// would run for every request that reaches it — including ones meant for
// routes registered later in index.js (e.g. /me, /policy-applications) — and
// 403 them for lacking this permission even though they have nothing to do
// with coverage pricing. Each route below takes the auth/permission checks
// as its own middleware instead, so they only ever apply to these 4 routes.
const guard = [requireAuth, requirePermission("MANAGE_COVERAGE_PRICING")];

async function findCoverageOr404(res, id) {
  const coverage = await prisma.productCoverage.findUnique({ where: { id } });
  if (!coverage) {
    res.status(404).json({ error: "Coverage not found" });
    return null;
  }
  return coverage;
}

router.get("/coverages/:id/pricing", ...guard, async (req, res, next) => {
  try {
    const { id } = req.params;
    const coverage = await findCoverageOr404(res, id);
    if (!coverage) return;

    const [valuePercentageTiers, flatTiers, percentagePricing] = await Promise.all([
      prisma.coverageValuePercentageTier.findMany({ where: { coverage_id: id }, orderBy: { min_value: "asc" } }),
      prisma.coverageTierBasedPricing.findMany({ where: { coverage_id: id }, orderBy: { coverage_amount: "asc" } }),
      prisma.coveragePercentageBasedPricing.findUnique({ where: { coverage_id: id } }),
    ]);

    res.json({
      pricing_mode: coverage.pricing_mode,
      standard_rate: percentagePricing?.standard_rate ?? null,
      value_percentage_tiers: valuePercentageTiers,
      tier_based_prices: flatTiers,
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

    const { pricing_mode, standard_rate } = req.body;

    const updated = await prisma.productCoverage.update({
      where: { id },
      data: { pricing_mode },
    });

    if (pricing_mode === "PERCENTAGE" && standard_rate !== undefined) {
      await prisma.coveragePercentageBasedPricing.upsert({
        where: { coverage_id: id },
        update: { standard_rate },
        create: { coverage_id: id, standard_rate },
      });
    }

    res.json({ pricing_mode: updated.pricing_mode });
  } catch (err) {
    next(err);
  }
});

// Replaces this coverage's entire value-percentage tier set — same
// replace-all pattern used for an agent's netrates.
router.put(
  "/coverages/:id/value-percentage-tiers",
  ...guard,
  validateBody(updateValuePercentageTiersSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const coverage = await findCoverageOr404(res, id);
      if (!coverage) return;

      const { tiers } = req.body;
      const minValues = tiers.map((t) => t.min_value);
      if (new Set(minValues).size !== minValues.length) {
        return res.status(400).json({ error: "Each tier needs a distinct min_value" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.coverageValuePercentageTier.deleteMany({ where: { coverage_id: id } });
        if (tiers.length > 0) {
          await tx.coverageValuePercentageTier.createMany({
            data: tiers.map((t) => ({ coverage_id: id, min_value: t.min_value, rate_percentage: t.rate_percentage })),
          });
        }
      });

      res.json({ message: "Value percentage tiers updated" });
    } catch (err) {
      next(err);
    }
  }
);

// Replaces this coverage's entire flat-tier set.
router.put(
  "/coverages/:id/flat-tiers",
  ...guard,
  validateBody(updateFlatTiersSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const coverage = await findCoverageOr404(res, id);
      if (!coverage) return;

      const { tiers } = req.body;
      const amounts = tiers.map((t) => t.coverage_amount);
      if (new Set(amounts).size !== amounts.length) {
        return res.status(400).json({ error: "Each tier needs a distinct coverage_amount" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.coverageTierBasedPricing.deleteMany({ where: { coverage_id: id } });
        if (tiers.length > 0) {
          await tx.coverageTierBasedPricing.createMany({
            data: tiers.map((t) => ({ coverage_id: id, coverage_amount: t.coverage_amount, coverage_price: t.coverage_price })),
          });
        }
      });

      res.json({ message: "Flat tiers updated" });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
