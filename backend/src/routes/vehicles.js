const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateBody, validateQuery } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const { updateVehicleSchema, lookupVehicleQuerySchema } = require("../schemas/vehicles");

const router = express.Router();

router.use(requireAuth, requirePermission("CREATE_APPLICATION"));

// Deliberately not scoped to the agent's own customers/companies — an agent
// needs to be able to find a plate that's on file under someone else's party,
// so a sold vehicle can be reassigned instead of duplicated. Only the vehicle's
// own details and its current owner's display name are exposed, nothing else.
router.get("/lookup", validateQuery(lookupVehicleQuerySchema), async (req, res, next) => {
  try {
    const { plate_number } = req.query;

    const vehicle = await prisma.vehicle.findFirst({
      where: { plate_number },
      orderBy: { created_at: "desc" },
      include: {
        customer_vehicles: {
          where: { ownership_end_date: null },
          select: { customer: { select: { id: true, first_name: true, last_name: true } } },
        },
        company_vehicles: {
          where: { ownership_end_date: null },
          select: { company: { select: { id: true, company_name: true } } },
        },
      },
    });

    if (!vehicle) {
      return res.status(404).json({ error: "No vehicle found with that plate number" });
    }

    const currentCustomer = vehicle.customer_vehicles[0]?.customer;
    const currentCompany = vehicle.company_vehicles[0]?.company;

    res.json({
      id: vehicle.id,
      plate_number: vehicle.plate_number,
      mv_file_no: vehicle.mv_file_no,
      engine_number: vehicle.engine_number,
      chassis_number: vehicle.chassis_number,
      make: vehicle.make,
      model: vehicle.model,
      year_model: vehicle.year_model,
      vehicle_type: vehicle.vehicle_type,
      color: vehicle.color,
      current_owner: currentCustomer
        ? { type: "CUSTOMER", id: currentCustomer.id, name: `${currentCustomer.first_name} ${currentCustomer.last_name}` }
        : currentCompany
          ? { type: "COMPANY", id: currentCompany.id, name: currentCompany.company_name }
          : null,
    });
  } catch (err) {
    next(err);
  }
});

// A vehicle isn't owned directly by an agent — it's reached through whichever
// customer/company it's on file for, and that party has to be one of this agent's.
async function agentCanEditVehicle(agentId, vehicleId) {
  const viaCustomer = await prisma.customerVehicle.findFirst({
    where: {
      vehicle_id: vehicleId,
      ownership_end_date: null,
      customer: { customer_agents: { some: { agent_id: agentId } } },
    },
  });
  if (viaCustomer) return true;

  const viaCompany = await prisma.companyVehicle.findFirst({
    where: {
      vehicle_id: vehicleId,
      ownership_end_date: null,
      company: { company_agents: { some: { agent_id: agentId } } },
    },
  });
  return Boolean(viaCompany);
}

router.patch("/:id", validateBody(updateVehicleSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const allowed = await agentCanEditVehicle(agentId, id);
    if (!allowed) {
      return res.status(403).json({ error: "This vehicle isn't connected to your agent account" });
    }

    const { plate_number, mv_file_no, engine_number, chassis_number, make, model, year_model, vehicle_type, color } =
      req.body;

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        plate_number,
        mv_file_no,
        engine_number,
        chassis_number,
        make: make || null,
        model: model || null,
        year_model: year_model ?? null,
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
