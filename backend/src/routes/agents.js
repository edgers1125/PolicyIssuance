const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, ensurePermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody, validateQuery } = require("../middleware/validate");
const {
  getAgentRatesQuerySchema,
  updateNetratesSchema,
  updateAgentValueTiersSchema,
  updateAgentFlatTiersSchema,
} = require("../schemas/agents");

const router = express.Router();

router.use(requireAuth, requirePermission("MANAGE_AGENTS"));

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

router.get("/", async (req, res, next) => {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { agent_name: "asc" },
      select: { id: true, agent_code: true, agent_name: true, work_email: true, status: true },
    });

    // Premiums and special rates are each a step up from just seeing the agent
    // roster, and independent of each other — each field group needs its own grant.
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    const canViewPremiums = actingPermissions.has("MANAGE_AGENTS.VIEW_AGENT_PREMIUMS");
    const canManageRates = actingPermissions.has("MANAGE_AGENTS.MANAGE_AGENT_RATES");

    let totalsByAgentId = new Map();
    if (canViewPremiums) {
      // Branch revenue per coverage is what was actually payable to Bethel on
      // it, frozen at submission time — never recomputed off the agent's
      // current rate/tiers, which may have since changed.
      const coverageRows = await prisma.applicationCoverage.findMany({
        select: {
          payable_to_bethel: true,
          application: { select: { agent_id: true, application_date: true } },
        },
      });

      const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
      for (const row of coverageRows) {
        const agentId = row.application.agent_id;
        const branchAmount = Number(row.payable_to_bethel);
        const totals = totalsByAgentId.get(agentId) || { allTime: 0, last30Days: 0 };
        totals.allTime += branchAmount;
        if (row.application.application_date >= thirtyDaysAgo) {
          totals.last30Days += branchAmount;
        }
        totalsByAgentId.set(agentId, totals);
      }
    }

    let ratesByAgentId = new Map();
    if (canManageRates) {
      const netrates = await prisma.agentNetrate.findMany({
        select: {
          agent_id: true,
          netrate: true,
          allowable_period: {
            select: { coverage_in_days: true, coverage: { select: { coverage_code: true, coverage_name: true } } },
          },
        },
      });
      for (const nr of netrates) {
        const list = ratesByAgentId.get(nr.agent_id) || [];
        list.push({
          coverage_code: nr.allowable_period.coverage.coverage_code,
          coverage_name: nr.allowable_period.coverage.coverage_name,
          coverage_in_days: nr.allowable_period.coverage_in_days,
          netrate: nr.netrate,
        });
        ratesByAgentId.set(nr.agent_id, list);
      }
    }

    res.json(
      agents.map((a) => ({
        ...a,
        ...(canViewPremiums
          ? {
              premiums_generated: totalsByAgentId.get(a.id)?.allTime || 0,
              premiums_generated_30d: totalsByAgentId.get(a.id)?.last30Days || 0,
            }
          : {}),
        ...(canManageRates ? { special_rates: ratesByAgentId.get(a.id) || [] } : {}),
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Every coverage offered at the given period, annotated with this agent's
// override (if any) alongside the product's own default pricing for that
// same period, so the UI can show what's customized vs default — shaped
// differently per pricing_mode, since a PERCENTAGE coverage has a single
// rate/cap override while VALUE_PERCENTAGE/FLAT_TIER coverages have a whole
// replace-all tier-table override instead. A coverage not offered at this
// period is left out entirely — there's nothing to override.
router.get("/:id/netrates", validateQuery(getAgentRatesQuerySchema), async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensurePermission(res, actingPermissions, "MANAGE_AGENTS.MANAGE_AGENT_RATES")) return;

    const { id } = req.params;
    const { coverage_in_days } = req.query;

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const coverages = await prisma.productCoverage.findMany({
      where: { status: "ACTIVE", allowable_periods: { some: { coverage_in_days } } },
      orderBy: [{ product_variant: { variant_name: "asc" } }, { coverage_name: "asc" }],
      select: {
        id: true,
        coverage_code: true,
        coverage_name: true,
        maximum_coverage: true,
        pricing_mode: true,
        product_variant: {
          select: { variant_name: true, insurance_class: { select: { class_name: true } } },
        },
        allowable_periods: {
          where: { coverage_in_days },
          select: {
            percentage_pricing: { select: { standard_rate: true } },
            value_percentage_tiers: { orderBy: { min_value: "asc" } },
            tier_based_prices: { orderBy: { coverage_amount: "asc" } },
            agent_netrates: {
              where: { agent_id: id },
              select: { netrate: true, maximum_coverage: true },
            },
            agent_value_percentage_tiers: {
              where: { agent_id: id },
              orderBy: { min_value: "asc" },
            },
            agent_flat_tier_prices: {
              where: { agent_id: id },
              orderBy: { coverage_amount: "asc" },
            },
          },
        },
      },
    });

    res.json(
      coverages.map((c) => {
        // Guaranteed exactly one row by the `some: { coverage_in_days }`
        // filter above (coverage_id + coverage_in_days is unique).
        const period = c.allowable_periods[0];
        return {
          id: c.id,
          coverage_code: c.coverage_code,
          coverage_name: c.coverage_name,
          class_name: c.product_variant.insurance_class.class_name,
          variant_name: c.product_variant.variant_name,
          pricing_mode: c.pricing_mode,
          standard_rate: period.percentage_pricing?.standard_rate ?? null,
          standard_maximum_coverage: c.maximum_coverage,
          override: period.agent_netrates[0]
            ? { netrate: period.agent_netrates[0].netrate, maximum_coverage: period.agent_netrates[0].maximum_coverage }
            : null,
          value_percentage_tiers: period.value_percentage_tiers,
          value_percentage_override:
            period.agent_value_percentage_tiers.length > 0 ? period.agent_value_percentage_tiers : null,
          tier_based_prices: period.tier_based_prices,
          flat_tier_override: period.agent_flat_tier_prices.length > 0 ? period.agent_flat_tier_prices : null,
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

// Replaces this agent's entire override set for one allowable period — any
// coverage left out simply falls back to the product's standard rate/cap for
// that period; a different period's overrides are untouched.
router.put("/:id/netrates", validateBody(updateNetratesSchema), async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensurePermission(res, actingPermissions, "MANAGE_AGENTS.MANAGE_AGENT_RATES")) return;

    const { id } = req.params;
    const { coverage_in_days, netrates } = req.body;

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const periods = await prisma.coverageAllowablePeriod.findMany({
      where: { coverage_id: { in: netrates.map((nr) => nr.coverage_id) }, coverage_in_days },
    });
    const periodIdByCoverageId = new Map(periods.map((p) => [p.coverage_id, p.id]));
    for (const nr of netrates) {
      if (!periodIdByCoverageId.has(nr.coverage_id)) {
        return res.status(400).json({ error: `One of the selected coverages is not offered for a ${coverage_in_days}-day period` });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.agentNetrate.deleteMany({ where: { agent_id: id, allowable_period: { coverage_in_days } } });
      if (netrates.length > 0) {
        await tx.agentNetrate.createMany({
          data: netrates.map((nr) => ({
            agent_id: id,
            coverage_allowable_period_id: periodIdByCoverageId.get(nr.coverage_id),
            netrate: nr.netrate,
            maximum_coverage: nr.maximum_coverage,
          })),
        });
      }
    });

    res.json({ message: "Agent rates updated" });
  } catch (err) {
    next(err);
  }
});

// Replaces this agent's entire value-percentage tier override for one
// coverage — an empty list clears the override entirely, falling back to the
// coverage's own default tiers.
router.put(
  "/:id/value-percentage-tiers/:coverageId",
  validateBody(updateAgentValueTiersSchema),
  async (req, res, next) => {
    try {
      const actingPermissions = await getUserPermissionCodes(req.user.userId);
      if (!ensurePermission(res, actingPermissions, "MANAGE_AGENTS.MANAGE_AGENT_RATES")) return;

      const { id, coverageId } = req.params;
      const { coverage_in_days, tiers } = req.body;

      const agent = await prisma.agent.findUnique({ where: { id } });
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      const period = await prisma.coverageAllowablePeriod.findUnique({
        where: { coverage_id_coverage_in_days: { coverage_id: coverageId, coverage_in_days } },
      });
      if (!period) {
        return res.status(400).json({ error: `This coverage is not offered for a ${coverage_in_days}-day period` });
      }

      const minValues = tiers.map((t) => t.min_value);
      if (new Set(minValues).size !== minValues.length) {
        return res.status(400).json({ error: "Each tier needs a distinct min_value" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.agentValuePercentageTier.deleteMany({ where: { agent_id: id, coverage_allowable_period_id: period.id } });
        if (tiers.length > 0) {
          await tx.agentValuePercentageTier.createMany({
            data: tiers.map((t) => ({
              agent_id: id,
              coverage_allowable_period_id: period.id,
              min_value: t.min_value,
              rate_percentage: t.rate_percentage,
            })),
          });
        }
      });

      res.json({ message: "Agent value-percentage tiers updated" });
    } catch (err) {
      next(err);
    }
  }
);

// Replaces this agent's entire flat-tier override for one coverage — an empty
// list clears the override entirely, falling back to the coverage's own
// default tiers.
router.put(
  "/:id/flat-tiers/:coverageId",
  validateBody(updateAgentFlatTiersSchema),
  async (req, res, next) => {
    try {
      const actingPermissions = await getUserPermissionCodes(req.user.userId);
      if (!ensurePermission(res, actingPermissions, "MANAGE_AGENTS.MANAGE_AGENT_RATES")) return;

      const { id, coverageId } = req.params;
      const { coverage_in_days, tiers } = req.body;

      const agent = await prisma.agent.findUnique({ where: { id } });
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      const period = await prisma.coverageAllowablePeriod.findUnique({
        where: { coverage_id_coverage_in_days: { coverage_id: coverageId, coverage_in_days } },
      });
      if (!period) {
        return res.status(400).json({ error: `This coverage is not offered for a ${coverage_in_days}-day period` });
      }

      const amounts = tiers.map((t) => t.coverage_amount);
      if (new Set(amounts).size !== amounts.length) {
        return res.status(400).json({ error: "Each tier needs a distinct coverage_amount" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.agentFlatTierPricing.deleteMany({ where: { agent_id: id, coverage_allowable_period_id: period.id } });
        if (tiers.length > 0) {
          await tx.agentFlatTierPricing.createMany({
            data: tiers.map((t) => ({
              agent_id: id,
              coverage_allowable_period_id: period.id,
              coverage_amount: t.coverage_amount,
              coverage_price: t.coverage_price,
            })),
          });
        }
      });

      res.json({ message: "Agent flat tiers updated" });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
