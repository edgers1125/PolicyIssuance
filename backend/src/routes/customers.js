const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requireAnyPermission, ensureAnyPermission, getUserPermissionCodes, INTAKE_PERMISSIONS } = require("../middleware/permissions");
const { validateBody, validateParams } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const { customerInputSchema, createCustomerSchema, agentIdParamSchema } = require("../schemas/customers");

// Callers allowed to create a brand-new customer under an agent other than
// their own — same two "choose an agent" permissions POST /policy-quotations
// and POST /policy-approval/admin-applications already gate their own
// cross-agent picker on.
const ADMIN_CREATE_PERMISSIONS = ["QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION", "APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION"];

const router = express.Router();

// requireAuth only at router level — the specific grant is required
// per-route below, same as catalog.js/coveragePricing.js, rather than via
// router.use(), because GET /agent/:agentId needs a different one entirely
// (QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION) and a caller who only has that
// one may well hold none of INTAKE_PERMISSIONS.
router.use(requireAuth);

// Customers connected to the logged-in agent only — not the whole customer
// base. Feeds both PolicyApplication.jsx and QuotationCreator.jsx — see
// INTAKE_PERMISSIONS (middleware/permissions.js).
router.get("/", requireAnyPermission(INTAKE_PERMISSIONS), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const links = await prisma.customerAgent.findMany({
      where: { agent_id: agentId },
      select: {
        customer: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            middle_name: true,
            email: true,
            mobile_number: true,
            birthday: true,
            gender: true,
            status: true,
            // Excludes vehicles reassigned away from this customer (sold to
            // someone else) — those no longer count as "on file" here.
            party_vehicles: { where: { ownership_end_date: null }, select: { vehicle: true } },
            party_addresses: { select: { address: true } },
          },
        },
      },
      orderBy: { customer: { last_name: "asc" } },
    });

    res.json(
      links.map((l) => ({
        ...l.customer,
        vehicles: l.customer.party_vehicles.map((pv) => pv.vehicle),
        addresses: l.customer.party_addresses.map((pa) => pa.address),
        party_vehicles: undefined,
        party_addresses: undefined,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAnyPermission(INTAKE_PERMISSIONS), validateBody(createCustomerSchema), async (req, res, next) => {
  try {
    // agent_id (optional): lets a caller filing on behalf of a different
    // agent (QuotationCreator.jsx's/PolicyApplication.jsx's own "Filing
    // Agent" picker) create a brand-new customer linked to THAT agent
    // instead of always the caller's own — the caller's own agent has no
    // bearing on who the customer is actually being filed for in that case,
    // and may not even exist (an approver isn't necessarily an agent at
    // all). Omitted, this is unchanged from before agent_id existed.
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

    const { first_name, last_name, middle_name, birthday, gender, email, mobile_number } = req.body;

    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "A customer with this email already exists" });
    }

    const customer = await prisma.customer.create({
      data: {
        first_name,
        last_name,
        middle_name: middle_name || null,
        birthday: birthday || null,
        gender: gender || null,
        email,
        mobile_number: mobile_number || null,
        status: "ACTIVE",
        customer_agents: { create: { agent_id: agentId } },
      },
    });

    res.status(201).json(customer);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireAnyPermission(INTAKE_PERMISSIONS), validateBody(customerInputSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const link = await prisma.customerAgent.findUnique({
      where: { customer_id_agent_id: { customer_id: id, agent_id: agentId } },
    });
    if (!link) {
      return res.status(403).json({ error: "This customer isn't connected to your agent account" });
    }

    const { first_name, last_name, middle_name, birthday, gender, email, mobile_number } = req.body;

    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing && existing.id !== id) {
      return res.status(409).json({ error: "A customer with this email already exists" });
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        first_name,
        last_name,
        middle_name: middle_name || null,
        birthday: birthday || null,
        gender: gender || null,
        email,
        mobile_number: mobile_number || null,
      },
    });

    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// Customers connected to a *chosen* agent, not the caller's own — the New
// Quotation form's cross-agent customer picker, shown only once
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
      const links = await prisma.customerAgent.findMany({
        where: { agent_id: req.params.agentId },
        select: {
          customer: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              middle_name: true,
              email: true,
              mobile_number: true,
              birthday: true,
              gender: true,
              status: true,
              party_vehicles: { where: { ownership_end_date: null }, select: { vehicle: true } },
              party_addresses: { select: { address: true } },
            },
          },
        },
        orderBy: { customer: { last_name: "asc" } },
      });

      res.json(
        links.map((l) => ({
          ...l.customer,
          vehicles: l.customer.party_vehicles.map((pv) => pv.vehicle),
          addresses: l.customer.party_addresses.map((pa) => pa.address),
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
