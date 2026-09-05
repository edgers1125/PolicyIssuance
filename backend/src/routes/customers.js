const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateBody } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const { customerInputSchema } = require("../schemas/customers");

const router = express.Router();

router.use(requireAuth, requirePermission("CREATE_APPLICATION"));

// Customers connected to the logged-in agent only — not the whole customer base.
router.get("/", async (req, res, next) => {
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
            customer_vehicles: { where: { ownership_end_date: null }, select: { vehicle: true } },
            customer_addresses: { select: { address: true } },
          },
        },
      },
      orderBy: { customer: { last_name: "asc" } },
    });

    res.json(
      links.map((l) => ({
        ...l.customer,
        vehicles: l.customer.customer_vehicles.map((cv) => cv.vehicle),
        addresses: l.customer.customer_addresses.map((ca) => ca.address),
        customer_vehicles: undefined,
        customer_addresses: undefined,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post("/", validateBody(customerInputSchema), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
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

router.patch("/:id", validateBody(customerInputSchema), async (req, res, next) => {
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

module.exports = router;
