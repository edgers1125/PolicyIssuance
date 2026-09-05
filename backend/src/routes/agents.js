const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, ensurePermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody } = require("../middleware/validate");
const { updateNetratesSchema } = require("../schemas/agents");

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
    const canViewPremiums = actingPermissions.has("VIEW_AGENT_PREMIUMS");
    const canManageRates = actingPermissions.has("MANAGE_AGENT_RATES");

    let totalsByAgentId = new Map();
    if (canViewPremiums) {
      // Branch revenue per coverage is coverage_amount × the rate frozen on it at
      // submission time — never the agent's current rate, which may have since changed.
      const coverageRows = await prisma.applicationCoverage.findMany({
        select: {
          coverage_amount: true,
          applied_rate: true,
          application: { select: { agent_id: true, application_date: true } },
        },
      });

      const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
      for (const row of coverageRows) {
        const agentId = row.application.agent_id;
        const branchAmount = Number(row.coverage_amount) * Number(row.applied_rate);
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
          product_coverage: { select: { coverage_code: true, coverage_name: true } },
        },
      });
      for (const nr of netrates) {
        const list = ratesByAgentId.get(nr.agent_id) || [];
        list.push({
          coverage_code: nr.product_coverage.coverage_code,
          coverage_name: nr.product_coverage.coverage_name,
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

// Every coverage, annotated with this agent's override (if any) alongside the
// product's standard rate/cap, so the UI can show what's customized vs default.
router.get("/:id/netrates", async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensurePermission(res, actingPermissions, "MANAGE_AGENT_RATES")) return;

    const { id } = req.params;

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
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
        product_variant: {
          select: { variant_name: true, insurance_class: { select: { class_name: true } } },
        },
        agent_netrates: {
          where: { agent_id: id },
          select: { netrate: true, maximum_coverage: true },
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
        standard_rate: c.standard_rate,
        standard_maximum_coverage: c.maximum_coverage,
        override: c.agent_netrates[0]
          ? { netrate: c.agent_netrates[0].netrate, maximum_coverage: c.agent_netrates[0].maximum_coverage }
          : null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Replaces this agent's entire override set with the given list — any coverage
// left out simply falls back to the product's standard rate/cap.
router.put("/:id/netrates", validateBody(updateNetratesSchema), async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensurePermission(res, actingPermissions, "MANAGE_AGENT_RATES")) return;

    const { id } = req.params;
    const { netrates } = req.body;

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.agentNetrate.deleteMany({ where: { agent_id: id } });
      if (netrates.length > 0) {
        await tx.agentNetrate.createMany({
          data: netrates.map((nr) => ({
            agent_id: id,
            product_coverage_id: nr.coverage_id,
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

module.exports = router;
