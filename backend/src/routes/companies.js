const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, requireAnyPermission, ensureAnyPermission, getUserPermissionCodes, INTAKE_PERMISSIONS } = require("../middleware/permissions");
const { validateBody, validateQuery, validateParams } = require("../middleware/validate");
const { getCurrentAgentId, getAccessibleAgentIds } = require("../lib/agent");
const {
  companyInputSchema,
  createCompanySchema,
  agentIdParamSchema,
  lookupCompanyQuerySchema,
  companyIdParamSchema,
  connectCompanySchema,
} = require("../schemas/companies");

// Callers allowed to create a brand-new company under an agent other than
// their own — same two "choose an agent" permissions POST /policy-quotations
// and POST /policy-approval/admin-applications already gate their own
// cross-agent picker on. Mirrors routes/customers.js's own
// ADMIN_CREATE_PERMISSIONS.
const ADMIN_CREATE_PERMISSIONS = ["QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION", "APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION"];

const router = express.Router();

// requireAuth only at router level — the specific grant is required
// per-route below, same as catalog.js/coveragePricing.js, rather than via
// router.use(), because GET /agent/:agentId needs a different one entirely
// (QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION) and a caller who only has that
// one may well hold none of INTAKE_PERMISSIONS.
router.use(requireAuth);

// Companies connected to the logged-in agent — not the whole company base,
// but also not *just* their own directly-linked ones: if this individual is
// employed under a CORPORATE agency (Agent.company_id) that's itself backed
// by a real Company (Agent.linked_company_id), that company is included too,
// so every employee can file for their own agency as a client, not only
// whoever happened to create the link. Feeds both PolicyApplication.jsx and
// QuotationCreator.jsx — see INTAKE_PERMISSIONS (middleware/permissions.js).
router.get("/", requireAnyPermission(INTAKE_PERMISSIONS), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }
    const accessibleAgentIds = await getAccessibleAgentIds(agentId);

    const links = await prisma.companyAgent.findMany({
      where: { agent_id: { in: accessibleAgentIds } },
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

    // accessibleAgentIds can carry more than one CompanyAgent link to the
    // same company (e.g. this individual's own link and their agency's
    // inherited one both pointing at it) — dedupe by company id so it never
    // shows up twice in the picker.
    const seen = new Set();
    const companies = [];
    for (const l of links) {
      if (seen.has(l.company.id)) continue;
      seen.add(l.company.id);
      companies.push({
        ...l.company,
        vehicles: l.company.party_vehicles.map((pv) => pv.vehicle),
        addresses: l.company.party_addresses.map((pa) => pa.address),
        party_vehicles: undefined,
        party_addresses: undefined,
      });
    }
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

// Deliberately not scoped to the agent's own companies — Company.email is
// unique (see that model's own schema comment), so an exact match always
// identifies a single real company regardless of which agent(s) already
// service them. Mirrors routes/customers.js's own GET /lookup. Registered
// before PATCH /:id so a caller can't collide with an actual company id.
router.get("/lookup", requireAnyPermission(INTAKE_PERMISSIONS), validateQuery(lookupCompanyQuerySchema), async (req, res, next) => {
  try {
    const query = req.query.query.trim();

    const company = await prisma.company.findFirst({
      where: { email: { equals: query, mode: "insensitive" } },
      select: { id: true, company_code: true, company_name: true, tin_no: true, email: true, status: true },
    });

    if (!company) {
      return res.status(404).json({ error: "No company found with that email" });
    }

    res.json(company);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAnyPermission(INTAKE_PERMISSIONS), validateBody(createCompanySchema), async (req, res, next) => {
  try {
    // agent_id (optional) — same reasoning/gate as routes/customers.js's own
    // POST /: lets a caller filing on behalf of a different agent create a
    // brand-new company linked to THAT agent instead of always their own.
    // Omitted, this is unchanged from before agent_id existed.
    let agentId;
    if (req.body.agent_id) {
      const actingPermissions = await getUserPermissionCodes(req.user.userId);
      if (!ensureAnyPermission(res, actingPermissions, ADMIN_CREATE_PERMISSIONS)) return;
      const agent = await prisma.agent.findUnique({ where: { id: req.body.agent_id } });
      if (!agent) {
        return res.status(400).json({ error: "agent_id does not match an existing agent" });
      }
      agentId = agent.id;
    } else {
      agentId = await getCurrentAgentId(req.user.userId);
      if (!agentId) {
        return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
      }
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

// Links the caller's own agent (or a chosen one, same ADMIN_CREATE_PERMISSIONS
// override as elsewhere) to a company found via GET /lookup above — same
// "many agents can share one insured party, so only ever add a link"
// reasoning as routes/customers.js's own POST /:id/connect. Idempotent.
router.post(
  "/:id/connect",
  requireAnyPermission(INTAKE_PERMISSIONS),
  validateParams(companyIdParamSchema),
  validateBody(connectCompanySchema),
  async (req, res, next) => {
    try {
      let agentId;
      if (req.body.agent_id) {
        const actingPermissions = await getUserPermissionCodes(req.user.userId);
        if (!ensureAnyPermission(res, actingPermissions, ADMIN_CREATE_PERMISSIONS)) return;
        const agent = await prisma.agent.findUnique({ where: { id: req.body.agent_id } });
        if (!agent) {
          return res.status(400).json({ error: "agent_id does not match an existing agent" });
        }
        agentId = agent.id;
      } else {
        agentId = await getCurrentAgentId(req.user.userId);
        if (!agentId) {
          return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
        }
      }

      const company = await prisma.company.findUnique({ where: { id: req.params.id } });
      if (!company) {
        return res.status(404).json({ error: "No company found with that id" });
      }

      await prisma.companyAgent.upsert({
        where: { company_id_agent_id: { company_id: company.id, agent_id: agentId } },
        create: { company_id: company.id, agent_id: agentId },
        update: {},
      });

      res.json(company);
    } catch (err) {
      next(err);
    }
  }
);

router.patch("/:id", requireAnyPermission(INTAKE_PERMISSIONS), validateBody(companyInputSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const accessibleAgentIds = await getAccessibleAgentIds(agentId);
    const link = await prisma.companyAgent.findFirst({
      where: { company_id: id, agent_id: { in: accessibleAgentIds } },
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
// GET /agents, the matching agent picker), and, for the same reason, the
// admin Policy Application form's own cross-agent picker once
// APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION is held (see
// routes/policyApproval.js's own GET /agents). Same response shape as GET /
// above, just scoped to :agentId instead of getCurrentAgentId(req.user.userId).
router.get(
  "/agent/:agentId",
  requireAnyPermission(["QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION", "APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION"]),
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

// My Agents' "Add Agent" (Company type) dialog's "link an existing company"
// picker — deliberately not scoped to the caller's own agent (unlike GET /
// above): backing a brand-new agency is an administrative action gated on
// MANAGE_AGENTS.ADD_AGENT, not something tied to whichever companies the
// caller personally services. Excludes a company already backing another
// CORPORATE agent (Agent.linked_company_id) — same "don't offer an
// already-claimed option twice" precedent as routes/users.js's GET /agents
// excluding an agent who already has_user.
router.get("/for-agent-linking", requirePermission("MANAGE_AGENTS.ADD_AGENT"), async (req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      where: { status: "ACTIVE", linked_agents: { none: {} } },
      orderBy: { company_name: "asc" },
      select: { id: true, company_code: true, company_name: true, email: true },
    });
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
