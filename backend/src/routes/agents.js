const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, ensurePermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody, validateQuery } = require("../middleware/validate");
const { computeAgentPremiumTotals } = require("../lib/agentPerformance");
const {
  createAgentSchema,
  updateAgentDetailsSchema,
  getAgentRatesQuerySchema,
  updateNetratesSchema,
  updateAgentValueTiersSchema,
  updateAgentFlatTiersSchema,
  updateAgentSeatsBasedPricingSchema,
  updateAgentSeatTiersSchema,
} = require("../schemas/agents");

const router = express.Router();

router.use(requireAuth, requirePermission("MANAGE_AGENTS"));

// An individual agent linked to a company (Agent.company_id) has their rates
// resolved from the company's own override rows (see lib/coveragePricing.js
// and GET /:id/netrates's own is_inherited flag above) — writing to their
// own, no-longer-read rows would silently do nothing useful, so every write
// route below blocks it outright and points the caller at the company's own
// rates page instead. Returns whether the check passed; callers must
// `return` immediately when it's false, same contract as ensurePermission.
function blockIfInheritedRates(agent, res) {
  if (!agent.company_id) return true;
  res.status(400).json({
    error: `This agent's rates are managed via ${agent.company?.agent_name || "their company"} — edit rates there instead`,
  });
  return false;
}

router.get("/", async (req, res, next) => {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { agent_name: "asc" },
      select: {
        id: true,
        agent_code: true,
        agent_name: true,
        work_email: true,
        status: true,
        agent_type: true,
        company_id: true,
        company: { select: { agent_name: true } },
        linked_company_id: true,
        linked_company: { select: { company_name: true } },
        payment_terms_days: true,
      },
    });

    // Premiums and special rates are each a step up from just seeing the agent
    // roster, and independent of each other — each field group needs its own grant.
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    const canViewPremiums = actingPermissions.has("MANAGE_AGENTS.VIEW_AGENT_PREMIUMS");
    const canManageRates = actingPermissions.has("MANAGE_AGENTS.MANAGE_AGENT_RATES");

    // Branch revenue per coverage is what was actually payable to Bethel on
    // it, frozen at submission time — never recomputed off the agent's
    // current rate/tiers, which may have since changed. Shared with
    // routes/accounting.js's own GET /overview — see lib/agentPerformance.js.
    const totalsByAgentId = canViewPremiums ? await computeAgentPremiumTotals(prisma) : new Map();

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
        id: a.id,
        agent_code: a.agent_code,
        agent_name: a.agent_name,
        work_email: a.work_email,
        status: a.status,
        agent_type: a.agent_type,
        company_id: a.company_id,
        company_name: a.company?.agent_name || null,
        linked_company_id: a.linked_company_id,
        linked_company_name: a.linked_company?.company_name || null,
        payment_terms_days: a.payment_terms_days,
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

// Registers a new agent — either an INDIVIDUAL (an actual person, who'll
// later be linked to a User via routes/users.js's own agent_id field, itself
// picked from GET /users/agents) or a CORPORATE one (an agency/company, with
// no login of its own — see Agent.company_id's schema comment). The My
// Agents page's "Add Agent"/"Add Company" action. A CORPORATE agent may also
// name (`linked_company_id`) or create (`new_company`) the real Company
// record it's backed by — see Agent.linked_company_id's own schema comment.
router.post("/", requirePermission("MANAGE_AGENTS.ADD_AGENT"), validateBody(createAgentSchema), async (req, res, next) => {
  try {
    const { agent_type, company_id, linked_company_id, new_company, payment_terms_days } = req.body;
    let { agent_code, agent_name, work_email } = req.body;

    if (company_id) {
      const company = await prisma.agent.findUnique({ where: { id: company_id }, select: { agent_type: true } });
      if (!company) {
        return res.status(400).json({ error: "company_id does not match an existing agent" });
      }
      if (company.agent_type !== "CORPORATE") {
        return res.status(400).json({ error: "company_id must reference a company-type agent" });
      }
    }

    let resolvedLinkedCompanyId = null;
    if (linked_company_id) {
      const existingCompany = await prisma.company.findUnique({ where: { id: linked_company_id } });
      if (!existingCompany) {
        return res.status(400).json({ error: "linked_company_id does not match an existing company" });
      }
      resolvedLinkedCompanyId = linked_company_id;
      // A CORPORATE agent backed by an existing Company takes its own
      // agent_name/agent_code/work_email straight from that company's own
      // company_name/company_code/email — overriding whatever the client sent
      // for these fields (createAgentSchema only requires them when this
      // agent ISN'T company-backed) so the two records can never disagree.
      agent_name = existingCompany.company_name;
      agent_code = existingCompany.company_code;
      work_email = existingCompany.email;
    } else if (new_company) {
      const existingCompanyCode = await prisma.company.findUnique({ where: { company_code: new_company.company_code } });
      if (existingCompanyCode) {
        return res.status(409).json({ error: "A company with this company code already exists" });
      }
      const existingCompanyEmail = await prisma.company.findUnique({ where: { email: new_company.email } });
      if (existingCompanyEmail) {
        return res.status(409).json({ error: "A company with this email already exists" });
      }
      // Same derivation as the linked_company_id branch above, off the
      // not-yet-created company's own input fields instead.
      agent_name = new_company.company_name;
      agent_code = new_company.company_code;
      work_email = new_company.email;
    }

    const existingCode = await prisma.agent.findUnique({ where: { agent_code } });
    if (existingCode) {
      return res.status(409).json({ error: "An agent with this agent code already exists" });
    }
    const existingEmail = await prisma.agent.findUnique({ where: { work_email } });
    if (existingEmail) {
      return res.status(409).json({ error: "An agent with this work email already exists" });
    }

    // Both the Agent row and (when creating one) its brand-new Company row,
    // plus the CompanyAgent link making that company a selectable insured
    // party for this agency, all commit together — see lib/agent.js's
    // getAccessibleAgentIds() for how every individual employed under this
    // agency (Agent.company_id) ends up seeing it too, not just this
    // CORPORATE row itself (which never logs in to use it directly).
    const agent = await prisma.$transaction(async (tx) => {
      let finalLinkedCompanyId = resolvedLinkedCompanyId;
      if (new_company) {
        const createdCompany = await tx.company.create({
          data: {
            company_code: new_company.company_code,
            company_name: new_company.company_name,
            tin_no: new_company.tin_no,
            email: new_company.email,
            status: "ACTIVE",
          },
        });
        finalLinkedCompanyId = createdCompany.id;
      }

      const createdAgent = await tx.agent.create({
        data: {
          agent_type,
          agent_code,
          agent_name,
          work_email,
          payment_terms_days,
          status: "ACTIVE",
          company_id: agent_type === "INDIVIDUAL" ? company_id || null : null,
          linked_company_id: agent_type === "CORPORATE" ? finalLinkedCompanyId : null,
        },
        select: {
          id: true,
          agent_code: true,
          agent_name: true,
          work_email: true,
          status: true,
          agent_type: true,
          company_id: true,
          linked_company_id: true,
          payment_terms_days: true,
        },
      });

      if (finalLinkedCompanyId) {
        await tx.companyAgent.create({
          data: { agent_id: createdAgent.id, company_id: finalLinkedCompanyId },
        });
      }

      return createdAgent;
    });

    res.status(201).json(agent);
  } catch (err) {
    next(err);
  }
});

// The only edit path for an already-created agent's own basic fields today —
// scoped to just payment_terms_days for now (agent_code/agent_name/
// work_email/company links have no edit path at all yet; see this route's
// own schema for why). My Agents' own small "Edit" affordance next to a
// row's payment terms.
router.patch("/:id", validateBody(updateAgentDetailsSchema), async (req, res, next) => {
  try {
    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data: { payment_terms_days: req.body.payment_terms_days },
      select: { id: true, agent_code: true, agent_name: true, payment_terms_days: true },
    });
    res.json(agent);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Agent not found" });
    }
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

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: { id: true, company_id: true, company: { select: { agent_name: true } } },
    });
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }
    // An individual linked to a company prices off the company's own
    // overrides, not their own dormant ones (same resolution as
    // lib/coveragePricing.js) — so viewing an individual's rates page shows
    // what's actually applied, and is_inherited tells the frontend to render
    // it read-only, pointing at the company's own rates page to edit instead.
    const effectiveAgentId = agent.company_id || agent.id;
    const isInherited = Boolean(agent.company_id);

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
              where: { agent_id: effectiveAgentId },
              select: { netrate: true, maximum_coverage: true },
            },
            agent_value_percentage_tiers: {
              where: { agent_id: effectiveAgentId },
              orderBy: { min_value: "asc" },
            },
            agent_flat_tier_prices: {
              where: { agent_id: effectiveAgentId },
              orderBy: { coverage_amount: "asc" },
            },
            seats_based_pricing: {
              select: { threshold_amount: true, exceed_threshold_amount: true, exceed_threshold_price: true },
            },
            agent_seats_based_pricing: {
              where: { agent_id: effectiveAgentId },
              select: { threshold_amount: true, exceed_threshold_amount: true, exceed_threshold_price: true },
            },
            seats_tier_prices: { orderBy: { insured_amount_per_occupant: "asc" } },
            agent_seats_tier_prices: {
              where: { agent_id: effectiveAgentId },
              orderBy: { insured_amount_per_occupant: "asc" },
            },
          },
        },
      },
    });

    const coverageRows = coverages.map((c) => {
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
          standard_seats_pricing: period.seats_based_pricing,
          seats_pricing_override: period.agent_seats_based_pricing[0] || null,
          seat_tier_prices: period.seats_tier_prices,
          seat_tier_override: period.agent_seats_tier_prices.length > 0 ? period.agent_seats_tier_prices : null,
        };
      });

    res.json({ is_inherited: isInherited, company_name: agent.company?.agent_name || null, coverages: coverageRows });
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

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: { id: true, company_id: true, company: { select: { agent_name: true } } },
    });
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }
    if (!blockIfInheritedRates(agent, res)) return;

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

      const agent = await prisma.agent.findUnique({
        where: { id },
        select: { id: true, company_id: true, company: { select: { agent_name: true } } },
      });
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      if (!blockIfInheritedRates(agent, res)) return;
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

      const agent = await prisma.agent.findUnique({
        where: { id },
        select: { id: true, company_id: true, company: { select: { agent_name: true } } },
      });
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      if (!blockIfInheritedRates(agent, res)) return;
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

// Replaces (or, sending threshold_amount/exceed_threshold_amount/
// exceed_threshold_price null, clears) this agent's excess-of-value bracket
// charge override for one coverage — three scalars per (agent, coverage,
// period), always sent/cleared together, same contract as AgentNetrate
// rather than the replace-all tier-list routes above. The tier menu itself
// (insured amount per occupant) is overridden separately, via the
// seats-tiers route right below.
router.put(
  "/:id/seats-based-pricing/:coverageId",
  validateBody(updateAgentSeatsBasedPricingSchema),
  async (req, res, next) => {
    try {
      const actingPermissions = await getUserPermissionCodes(req.user.userId);
      if (!ensurePermission(res, actingPermissions, "MANAGE_AGENTS.MANAGE_AGENT_RATES")) return;

      const { id, coverageId } = req.params;
      const { coverage_in_days, threshold_amount, exceed_threshold_amount, exceed_threshold_price } = req.body;

      const agent = await prisma.agent.findUnique({
        where: { id },
        select: { id: true, company_id: true, company: { select: { agent_name: true } } },
      });
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      if (!blockIfInheritedRates(agent, res)) return;
      const period = await prisma.coverageAllowablePeriod.findUnique({
        where: { coverage_id_coverage_in_days: { coverage_id: coverageId, coverage_in_days } },
      });
      if (!period) {
        return res.status(400).json({ error: `This coverage is not offered for a ${coverage_in_days}-day period` });
      }

      if (threshold_amount === null) {
        await prisma.agentSeatsBasedPricing.deleteMany({
          where: { agent_id: id, coverage_allowable_period_id: period.id },
        });
      } else {
        await prisma.agentSeatsBasedPricing.upsert({
          where: { agent_id_coverage_allowable_period_id: { agent_id: id, coverage_allowable_period_id: period.id } },
          update: { threshold_amount, exceed_threshold_amount, exceed_threshold_price },
          create: { agent_id: id, coverage_allowable_period_id: period.id, threshold_amount, exceed_threshold_amount, exceed_threshold_price },
        });
      }

      res.json({ message: "Agent seats-based pricing updated" });
    } catch (err) {
      next(err);
    }
  }
);

// Replaces this agent's entire VEHICLE_SEATS_BASED tier-menu override for one
// coverage — an empty list clears the override entirely, falling back to the
// coverage's own default tiers. Same replace-all pattern as
// /:id/flat-tiers/:coverageId.
router.put(
  "/:id/seats-tiers/:coverageId",
  validateBody(updateAgentSeatTiersSchema),
  async (req, res, next) => {
    try {
      const actingPermissions = await getUserPermissionCodes(req.user.userId);
      if (!ensurePermission(res, actingPermissions, "MANAGE_AGENTS.MANAGE_AGENT_RATES")) return;

      const { id, coverageId } = req.params;
      const { coverage_in_days, tiers } = req.body;

      const agent = await prisma.agent.findUnique({
        where: { id },
        select: { id: true, company_id: true, company: { select: { agent_name: true } } },
      });
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      if (!blockIfInheritedRates(agent, res)) return;
      const period = await prisma.coverageAllowablePeriod.findUnique({
        where: { coverage_id_coverage_in_days: { coverage_id: coverageId, coverage_in_days } },
      });
      if (!period) {
        return res.status(400).json({ error: `This coverage is not offered for a ${coverage_in_days}-day period` });
      }

      const amounts = tiers.map((t) => t.insured_amount_per_occupant);
      if (new Set(amounts).size !== amounts.length) {
        return res.status(400).json({ error: "Each tier needs a distinct insured_amount_per_occupant" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.agentSeatsTierPricing.deleteMany({ where: { agent_id: id, coverage_allowable_period_id: period.id } });
        if (tiers.length > 0) {
          await tx.agentSeatsTierPricing.createMany({
            data: tiers.map((t) => ({
              agent_id: id,
              coverage_allowable_period_id: period.id,
              insured_amount_per_occupant: t.insured_amount_per_occupant,
            })),
          });
        }
      });

      res.json({ message: "Agent seat tiers updated" });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
