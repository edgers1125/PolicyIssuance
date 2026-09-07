const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, ensurePermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody } = require("../middleware/validate");
const { updateCoverageSchema } = require("../schemas/catalog");

const router = express.Router();

router.get(
  "/product-catalog",
  requireAuth,
  requirePermission("CREATE_APPLICATION"),
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { agent_id: true },
      });

      const overridesByCoverageId = new Map();
      if (user?.agent_id) {
        const overrides = await prisma.agentNetrate.findMany({
          where: { agent_id: user.agent_id },
          select: { product_coverage_id: true, netrate: true, maximum_coverage: true },
        });
        for (const o of overrides) {
          overridesByCoverageId.set(o.product_coverage_id, o);
        }
      }

      const classes = await prisma.insuranceClass.findMany({
        where: { status: "ACTIVE" },
        orderBy: { class_name: "asc" },
        select: {
          id: true,
          class_name: true,
          product_variants: {
            where: { status: "ACTIVE" },
            orderBy: { variant_name: "asc" },
            select: {
              id: true,
              variant_code: true,
              variant_name: true,
              product_coverages: {
                where: { status: "ACTIVE" },
                orderBy: { coverage_name: "asc" },
                select: {
                  id: true,
                  coverage_code: true,
                  coverage_name: true,
                  maximum_coverage: true,
                  clause: true,
                  pricing_mode: true,
                  percentage_pricing: { select: { standard_rate: true } },
                  value_percentage_tiers: { orderBy: { min_value: "asc" } },
                  tier_based_prices: { orderBy: { coverage_amount: "asc" } },
                },
              },
            },
          },
        },
      });

      // Every agent gets every coverage — an agent-specific override (if one
      // exists) replaces the product's own standard rate/cap, it doesn't gate access.
      const withRates = classes.map((cls) => ({
        ...cls,
        product_variants: cls.product_variants.map((variant) => ({
          ...variant,
          product_coverages: variant.product_coverages.map((cov) => {
            const override = overridesByCoverageId.get(cov.id);
            return {
              ...cov,
              // Only meaningful for PERCENTAGE-mode coverages — a
              // VALUE_PERCENTAGE/FLAT_TIER one has no percentage_pricing row
              // at all, so this just falls back to 0 (unused either way).
              rate: override ? override.netrate : (cov.percentage_pricing?.standard_rate ?? 0),
              effective_maximum_coverage:
                override && override.maximum_coverage !== null ? override.maximum_coverage : cov.maximum_coverage,
              is_custom_rate: Boolean(override),
            };
          }),
        })),
      }));

      res.json(withRates);
    } catch (err) {
      next(err);
    }
  }
);

// Flat list of every active coverage, for the Settings pages that edit clause
// text or the standard rate/max directly on the product (not per-agent).
router.get("/coverages", requireAuth, async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (
      !actingPermissions.has("EDIT_CLAUSES") &&
      !actingPermissions.has("EDIT_COVERAGE_DEFAULTS") &&
      !actingPermissions.has("MANAGE_COVERAGE_PRICING")
    ) {
      return res.status(403).json({
        error: "Missing required permission: EDIT_CLAUSES, EDIT_COVERAGE_DEFAULTS, or MANAGE_COVERAGE_PRICING",
      });
    }

    const coverages = await prisma.productCoverage.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ product_variant: { variant_name: "asc" } }, { coverage_name: "asc" }],
      select: {
        id: true,
        coverage_code: true,
        coverage_name: true,
        maximum_coverage: true,
        clause: true,
        pricing_mode: true,
        percentage_pricing: { select: { standard_rate: true } },
        product_variant: {
          select: { variant_name: true, insurance_class: { select: { class_name: true } } },
        },
      },
    });

    res.json(
      coverages.map((c) => ({
        id: c.id,
        coverage_code: c.coverage_code,
        coverage_name: c.coverage_name,
        class_name: c.product_variant.insurance_class.class_name,
        variant_name: c.product_variant.variant_name,
        maximum_coverage: c.maximum_coverage,
        standard_rate: c.percentage_pricing?.standard_rate ?? null,
        clause: c.clause,
        pricing_mode: c.pricing_mode,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.patch("/coverages/:id", requireAuth, validateBody(updateCoverageSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clause, maximum_coverage } = req.body;

    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (clause !== undefined && !ensurePermission(res, actingPermissions, "EDIT_CLAUSES")) return;
    // Editing lives on the Manage Coverage Pricing page now, but
    // EDIT_COVERAGE_DEFAULTS is left valid too so no existing role loses this
    // ability just because the field moved pages.
    if (
      maximum_coverage !== undefined &&
      !actingPermissions.has("EDIT_COVERAGE_DEFAULTS") &&
      !actingPermissions.has("MANAGE_COVERAGE_PRICING")
    ) {
      return res.status(403).json({
        error: "Missing required permission: EDIT_COVERAGE_DEFAULTS or MANAGE_COVERAGE_PRICING",
      });
    }

    const coverage = await prisma.productCoverage.findUnique({ where: { id } });
    if (!coverage) {
      return res.status(404).json({ error: "Coverage not found" });
    }

    const updated = await prisma.productCoverage.update({
      where: { id },
      data: { clause, maximum_coverage },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
