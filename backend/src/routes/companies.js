const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, requireAnyPermission, INTAKE_PERMISSIONS } = require("../middleware/permissions");
const { validateBody, validateParams } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const { companyInputSchema, agentIdParamSchema } = require("../schemas/companies");

const router = express.Router();

// requireAuth only at router level — the specific grant is required
// per-route below, same as catalog.js/coveragePricing.js, rather than via
// router.use(), because GET /agent/:agentId needs a different one entirely
// (QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION) and a caller who only has that
// one may well hold none of INTAKE_PERMISSIONS.
router.use(requireAuth);

// Companies connected to the logged-in agent only — not the whole company
// base. Feeds both PolicyApplication.jsx and QuotationCreator.jsx — see
// INTAKE_PERMISSIONS (middleware/permissions.js).
router.get("/", requireAnyPermission(INTAKE_PERMISSIONS), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const links = await prisma.companyAgent.findMany({
      where: { agent_id: agentId },
      select: {
        company: {
          select: {
            id: true,
            company_code: true,
            company_name: true,
            tin_no: true,
            email: true,
            status: true,
            // Excludes vehicles reassigned away from this company (sold to
            // someone else) — those no longer count as "on file" here.
            party_vehicles: { where: { ownership_end_date: null }, select: { vehicle: true } },
            party_addresses: { select: { address: true } },
          },
        },
      },
      orderBy: { company: { company_name: "asc" } },
    });

    res.json(
      links.map((l) => ({
        ...l.company,
        vehicles: l.company.party_vehicles.map((pv) => pv.vehicle),
        addresses: l.company.party_addresses.map((pa) => pa.address),
        party_vehicles: undefined,
        party_addresses: undefined,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAnyPermission(INTAKE_PERMISSIONS), validateBody(companyInputSchema), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const { company_code, company_name, tin_no, email } = req.body;

    const existingCode = await prisma.company.findUnique({ where: { company_code } });
    if (existingCode) {
      return res.status(409).json({ error: "A company with this code already exists" });
    }
    const existingEmail = await prisma.company.findUnique({ where: { email } });
    if (existingEmail) {
      return res.status(409).json({ error: "A company with this email already exists" });
    }

    const company = await prisma.company.create({
      data: {
        company_code,
        company_name,
        tin_no: tin_no || null,
        email,
        status: "ACTIVE",
        company_agents: { create: { agent_id: agentId } },
      },
    });

    res.status(201).json(company);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireAnyPermission(INTAKE_PERMISSIONS), validateBody(companyInputSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const link = await prisma.companyAgent.findUnique({
      where: { company_id_agent_id: { company_id: id, agent_id: agentId } },
    });
    if (!link) {
      return res.status(403).json({ error: "This company isn't connected to your agent account" });
    }

    const { company_code, company_name, tin_no, email } = req.body;

    const existingCode = await prisma.company.findUnique({ where: { company_code } });
    if (existingCode && existingCode.id !== id) {
      return res.status(409).json({ error: "A company with this code already exists" });
    }
    const existingEmail = await prisma.company.findUnique({ where: { email } });
    if (existingEmail && existingEmail.id !== id) {
      return res.status(409).json({ error: "A company with this email already exists" });
    }

    const company = await prisma.company.update({
      where: { id },
      data: { company_code, company_name, tin_no: tin_no || null, email },
    });

    res.json(company);
  } catch (err) {
    next(err);
  }
});

// Companies connected to a *chosen* agent, not the caller's own — the New
// Quotation form's cross-agent company picker, shown only once
// QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION is held (see routes/policyQuotations.js's
// GET /agents, the matching agent picker). Same response shape as GET /
// above, just scoped to :agentId instead of getCurrentAgentId(req.user.userId).
router.get(
  "/agent/:agentId",
  requirePermission("QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION"),
  validateParams(agentIdParamSchema),
  async (req, res, next) => {
    try {
      const links = await prisma.companyAgent.findMany({
        where: { agent_id: req.params.agentId },
        select: {
          company: {
            select: {
              id: true,
              company_code: true,
              company_name: true,
              tin_no: true,
              email: true,
              status: true,
              party_vehicles: { where: { ownership_end_date: null }, select: { vehicle: true } },
              party_addresses: { select: { address: true } },
            },
          },
        },
        orderBy: { company: { company_name: "asc" } },
      });

      res.json(
        links.map((l) => ({
          ...l.company,
          vehicles: l.company.party_vehicles.map((pv) => pv.vehicle),
          addresses: l.company.party_addresses.map((pa) => pa.address),
          party_vehicles: undefined,
          party_addresses: undefined,
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
