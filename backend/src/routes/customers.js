const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requireAnyPermission, ensureAnyPermission, getUserPermissionCodes, INTAKE_PERMISSIONS } = require("../middleware/permissions");
const { validateBody, validateQuery, validateParams } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const {
  customerInputSchema,
  createCustomerSchema,
  agentIdParamSchema,
  lookupCustomerQuerySchema,
  customerIdParamSchema,
  connectCustomerSchema,
} = require("../schemas/customers");

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

// Deliberately not scoped to the agent's own customers — Customer.email and
// Customer.mobile_number are both unique (see that model's own schema
// comment), so an exact match on either one always identifies a single real
// person regardless of which agent(s) already service them. Mirrors
// vehicles.js's own GET /lookup (same "find it even under someone else's
// party, don't make the agent duplicate it" reasoning) — an agent who finds
// a match here reuses it via POST /:id/connect below rather than re-creating
// the customer under a new (would-be-409) email. Registered before PATCH
// /:id so a caller can't collide with an actual customer id.
router.get("/lookup", requireAnyPermission(INTAKE_PERMISSIONS), validateQuery(lookupCustomerQuerySchema), async (req, res, next) => {
  try {
    // Trimmed the same way vehicles.js's own plate lookup is — an agent
    // typing an email/number by hand won't always land on the exact
    // whitespace/casing already on file.
    const query = req.query.query.trim();

    const customer = await prisma.customer.findFirst({
      where: {
        OR: [{ email: { equals: query, mode: "insensitive" } }, { mobile_number: query }],
      },
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
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "No customer found with that email or mobile number" });
    }

    res.json(customer);
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
    if (mobile_number) {
      const existingMobile = await prisma.customer.findUnique({ where: { mobile_number } });
      if (existingMobile) {
        return res.status(409).json({ error: "A customer with this mobile number already exists" });
      }
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

// Links the caller's own agent (or, with agent_id + ADMIN_CREATE_PERMISSIONS,
// a chosen one — same override every other create-ish route here already
// takes) to a customer found via GET /lookup above but not yet connected to
// them — unlike a Vehicle's own reassign_owner (which *moves* a vehicle from
// one party to another), a Customer can legitimately be serviced by more
// than one agent at once (CustomerAgent is a many-to-many), so this only
// ever adds a link, never removes one. Idempotent: connecting an already-
// connected customer is a no-op success, not a 409, since the caller's own
// intent ("I want to file for this person") is already satisfied either way.
router.post(
  "/:id/connect",
  requireAnyPermission(INTAKE_PERMISSIONS),
  validateParams(customerIdParamSchema),
  validateBody(connectCustomerSchema),
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

      const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!customer) {
        return res.status(404).json({ error: "No customer found with that id" });
      }

      await prisma.customerAgent.upsert({
        where: { customer_id_agent_id: { customer_id: customer.id, agent_id: agentId } },
        create: { customer_id: customer.id, agent_id: agentId },
        update: {},
      });

      res.json(customer);
    } catch (err) {
      next(err);
    }
  }
);

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
    if (mobile_number) {
      const existingMobile = await prisma.customer.findUnique({ where: { mobile_number } });
      if (existingMobile && existingMobile.id !== id) {
        return res.status(409).json({ error: "A customer with this mobile number already exists" });
      }
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
