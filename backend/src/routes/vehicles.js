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

// A vehicle isn't owned directly by an agent — it's reached through whichever
// customer/company it's on file for, and that party has to be one of this agent's.
async function agentCanEditVehicle(agentId, vehicleId) {
  const viaCustomer = await prisma.customerVehicle.findFirst({
    where: {
      vehicle_id: vehicleId,
      customer: { customer_agents: { some: { agent_id: agentId } } },
    },
  });
  if (viaCustomer) return true;

  const viaCompany = await prisma.companyVehicle.findFirst({
    where: {
      vehicle_id: vehicleId,
      company: { company_agents: { some: { agent_id: agentId } } },
    },
  });
  return Boolean(viaCompany);
}

router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const agentId = await getCurrentAgentId(req);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const allowed = await agentCanEditVehicle(agentId, id);
    if (!allowed) {
      return res.status(403).json({ error: "This vehicle isn't connected to your agent account" });
    }

    const { plate_number, mv_file_no, engine_number, chassis_number, make, model, year_model, vehicle_type, color } =
      req.body;

    if (!plate_number || !mv_file_no || !engine_number || !chassis_number) {
      return res
        .status(400)
        .json({ error: "plate_number, mv_file_no, engine_number, and chassis_number are required" });
    }

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        plate_number,
        mv_file_no,
        engine_number,
        chassis_number,
        make: make || null,
        model: model || null,
        year_model: year_model ? Number(year_model) : null,
        vehicle_type: vehicle_type || null,
        color: color || null,
      },
    });

    res.json(vehicle);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
