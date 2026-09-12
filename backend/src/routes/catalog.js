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
      // Never matches a real agent id — lets the nested `where: { agent_id }`
      // filters below run unconditionally instead of branching the whole
      // query shape on whether this user even has an agent profile.
      const agentId = user?.agent_id ?? "no-agent-profile";

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
                  // Pricing (standard rate, both tier tables, and this
                  // agent's overrides of each) lives per allowable period,
                  // not flat on the coverage — a coverage can charge
                  // differently for its 180-day period than its 365-day one.
                  allowable_periods: {
                    orderBy: { coverage_in_days: "asc" },
                    select: {
                      coverage_in_days: true,
                      percentage_pricing: { select: { standard_rate: true } },
                      value_percentage_tiers: { orderBy: { min_value: "asc" } },
                      tier_based_prices: { orderBy: { coverage_amount: "asc" } },
                      agent_netrates: {
                        where: { agent_id: agentId },
                        select: { netrate: true, maximum_coverage: true },
                      },
                      agent_value_percentage_tiers: {
                        where: { agent_id: agentId },
                        orderBy: { min_value: "asc" },
                      },
                      agent_flat_tier_prices: {
                        where: { agent_id: agentId },
                        orderBy: { coverage_amount: "asc" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Every agent gets every coverage — an agent-specific override (if one
      // exists) replaces the product's own standard rate/cap for that same
      // period, it doesn't gate access.
      const withRates = classes.map((cls) => ({
        ...cls,
        product_variants: cls.product_variants.map((variant) => ({
          ...variant,
          product_coverages: variant.product_coverages.map((cov) => {
            const { allowable_periods, ...coverageFields } = cov;
            return {
              ...coverageFields,
              allowable_periods: allowable_periods.map((p) => {
                const override = p.agent_netrates[0];
                const valueTierOverride = p.agent_value_percentage_tiers;
                const flatTierOverride = p.agent_flat_tier_prices;
                return {
                  coverage_in_days: p.coverage_in_days,
                  // Only meaningful for PERCENTAGE-mode coverages — a
                  // VALUE_PERCENTAGE/FLAT_TIER one has no percentage_pricing
                  // row at all, so this just falls back to 0 (unused either way).
                  rate: override ? override.netrate : (p.percentage_pricing?.standard_rate ?? 0),
                  effective_maximum_coverage:
                    override && override.maximum_coverage !== null ? override.maximum_coverage : cov.maximum_coverage,
                  is_custom_rate: Boolean(override),
                  // An agent's own tier table (if set) replaces the coverage's
                  // default tiers for this period entirely — the client never
                  // needs to know whether a tier came from the coverage or an
                  // agent override, it just prices off whatever's here.
                  value_percentage_tiers: valueTierOverride.length > 0 ? valueTierOverride : p.value_percentage_tiers,
                  tier_based_prices: flatTierOverride.length > 0 ? flatTierOverride : p.tier_based_prices,
                  has_custom_tiers: valueTierOverride.length > 0 || flatTierOverride.length > 0,
                };
              }),
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
      !actingPermissions.has("MANAGE_SETTINGS.EDIT_CLAUSES") &&
      !actingPermissions.has("MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING")
    ) {
      return res.status(403).json({
        error:
          "Missing required permission: MANAGE_SETTINGS.EDIT_CLAUSES or MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING",
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
        product_variant: {
          select: { variant_name: true, insurance_class: { select: { class_name: true } } },
        },
        // The set of periods this coverage is offered at — the Manage
        // Coverage Pricing page picks one before showing/editing its
        // rate/tiers, since those are scoped per period now.
        allowable_periods: {
          select: { id: true, coverage_in_days: true },
          orderBy: { coverage_in_days: "asc" },
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
        clause: c.clause,
        pricing_mode: c.pricing_mode,
        allowable_periods: c.allowable_periods,
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
    if (clause !== undefined && !ensurePermission(res, actingPermissions, "MANAGE_SETTINGS.EDIT_CLAUSES")) return;
    if (
      maximum_coverage !== undefined &&
      !ensurePermission(res, actingPermissions, "MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING")
    ) {
      return;
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
