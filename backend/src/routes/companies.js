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

// Companies connected to the logged-in agent only — not the whole company base.
router.get("/", async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req);
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
          },
        },
      },
      orderBy: { company: { company_name: "asc" } },
    });

    res.json(links.map((l) => l.company));
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

    const { company_code, company_name, tin_no, email } = req.body;

    if (!company_code || !company_name || !email) {
      return res.status(400).json({ error: "company_code, company_name, and email are required" });
    }

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

module.exports = router;
