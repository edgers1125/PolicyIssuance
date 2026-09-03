const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, getUserPermissionCodes } = require("../middleware/permissions");

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
                  standard_rate: true,
                  clause: true,
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
              rate: override ? override.netrate : cov.standard_rate,
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
    if (!actingPermissions.has("EDIT_CLAUSES") && !actingPermissions.has("EDIT_COVERAGE_DEFAULTS")) {
      return res.status(403).json({ error: "Missing required permission: EDIT_CLAUSES or EDIT_COVERAGE_DEFAULTS" });
    }

    const coverages = await prisma.productCoverage.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ product_variant: { variant_name: "asc" } }, { coverage_name: "asc" }],
      select: {
        id: true,
        coverage_code: true,
        coverage_name: true,
        maximum_coverage: true,
        standard_rate: true,
        clause: true,
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
        standard_rate: c.standard_rate,
        clause: c.clause,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.patch("/coverages/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clause, standard_rate, maximum_coverage } = req.body;

    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (clause !== undefined && !actingPermissions.has("EDIT_CLAUSES")) {
      return res.status(403).json({ error: "Missing required permission: EDIT_CLAUSES" });
    }
    if (
      (standard_rate !== undefined || maximum_coverage !== undefined) &&
      !actingPermissions.has("EDIT_COVERAGE_DEFAULTS")
    ) {
      return res.status(403).json({ error: "Missing required permission: EDIT_COVERAGE_DEFAULTS" });
    }

    const coverage = await prisma.productCoverage.findUnique({ where: { id } });
    if (!coverage) {
      return res.status(404).json({ error: "Coverage not found" });
    }

    const data = {};
    if (clause !== undefined) {
      if (!clause) {
        return res.status(400).json({ error: "clause cannot be empty" });
      }
      data.clause = clause;
    }
    if (standard_rate !== undefined) {
      if (standard_rate === null || Number(standard_rate) <= 0) {
        return res.status(400).json({ error: "standard_rate must be a positive number" });
      }
      data.standard_rate = standard_rate;
    }
    if (maximum_coverage !== undefined) {
      if (maximum_coverage === null || Number(maximum_coverage) <= 0) {
        return res.status(400).json({ error: "maximum_coverage must be a positive number" });
      }
      data.maximum_coverage = maximum_coverage;
    }

    const updated = await prisma.productCoverage.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
