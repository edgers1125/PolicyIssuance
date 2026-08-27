const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

const router = express.Router();

router.use(requireAuth, requirePermission("CREATE_APPLICATION"));

async function getCurrentAgentId(req) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { agent_id: true },
  });
  return user?.agent_id || null;
}

// Customers connected to the logged-in agent only — not the whole customer base.
router.get("/", async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req);
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
          },
        },
      },
      orderBy: { customer: { last_name: "asc" } },
    });

    res.json(links.map((l) => l.customer));
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const { first_name, last_name, middle_name, birthday, gender, email, mobile_number } = req.body;

    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: "first_name, last_name, and email are required" });
    }

    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "A customer with this email already exists" });
    }

    const customer = await prisma.customer.create({
      data: {
        first_name,
        last_name,
        middle_name: middle_name || null,
        birthday: birthday ? new Date(birthday) : null,
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

module.exports = router;
