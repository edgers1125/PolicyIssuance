const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requireAnyPermission, INTAKE_PERMISSIONS } = require("../middleware/permissions");
const { validateBody, validateQuery } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const { updateVehicleSchema, lookupVehicleQuerySchema } = require("../schemas/vehicles");
const { currentVehicleValue } = require("../lib/vehicleValue");

const router = express.Router();

// Feeds both PolicyApplication.jsx and QuotationCreator.jsx's vehicle
// reuse/reassignment flow — see INTAKE_PERMISSIONS (middleware/permissions.js).
router.use(requireAuth, requireAnyPermission(INTAKE_PERMISSIONS));

// Deliberately not scoped to the agent's own customers/companies — an agent
// needs to be able to find a plate that's on file under someone else's party,
// so a sold vehicle can be reassigned instead of duplicated. Only the vehicle's
// own details and its current owner's display name are exposed, nothing else.
router.get("/lookup", validateQuery(lookupVehicleQuerySchema), async (req, res, next) => {
  try {
    // Case and stray whitespace shouldn't matter here — an agent typing a
    // plate by hand won't reliably match how it happens to be cased on file,
    // and the on-screen suggestion list already matches case-insensitively,
    // so this lookup needs to as well or a "found" plate can silently 404.
    const plateNumber = req.query.plate_number.trim();

    const vehicle = await prisma.vehicle.findFirst({
      where: { plate_number: { equals: plateNumber, mode: "insensitive" } },
      orderBy: { created_at: "desc" },
      include: {
        product_variant: { select: { id: true, variant_name: true } },
        party_vehicles: {
          where: { ownership_end_date: null },
          select: {
            customer: { select: { id: true, first_name: true, last_name: true } },
            company: { select: { id: true, company_name: true } },
          },
        },
      },
    });

    if (!vehicle) {
      return res.status(404).json({ error: "No vehicle found with that plate number" });
    }

    const currentCustomer = vehicle.party_vehicles[0]?.customer;
    const currentCompany = vehicle.party_vehicles[0]?.company;

    // Lets the intake wizard proactively surface "this vehicle already has
    // policy history" the moment a plate match is found — before the agent
    // fills out the rest of the form — rather than only at submit time. The
    // single most-recently-issued policy for this vehicle, regardless of
    // which agent/party it was under (same global, asset-not-party history
    // this route's own create-time enforcement follows — see
    // lib/policyConflicts.js).
    const latestPolicyVehicle = await prisma.policyVehicle.findFirst({
      where: { vehicle_id: vehicle.id },
      select: {
        policy: { select: { id: true, policy_number: true, policy_status: true, effective_date: true, expiry_date: true } },
      },
      orderBy: { policy: { effective_date: "desc" } },
    });

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
      no_of_seats: vehicle.no_of_seats,
      product_variant_id: vehicle.product_variant_id,
      product_variant_name: vehicle.product_variant?.variant_name || null,
      estimated_value: vehicle.estimated_value,
      initial_assessment_date: vehicle.initial_assessment_date,
      current_value: currentVehicleValue(vehicle.estimated_value, vehicle.initial_assessment_date),
      current_owner: currentCustomer
        ? { type: "CUSTOMER", id: currentCustomer.id, name: `${currentCustomer.first_name} ${currentCustomer.last_name}` }
        : currentCompany
          ? { type: "COMPANY", id: currentCompany.id, name: currentCompany.company_name }
          : null,
      latest_policy: latestPolicyVehicle
        ? {
            id: latestPolicyVehicle.policy.id,
            policy_number: latestPolicyVehicle.policy.policy_number,
            status: latestPolicyVehicle.policy.policy_status,
            effective_date: latestPolicyVehicle.policy.effective_date,
            expiry_date: latestPolicyVehicle.policy.expiry_date,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// A vehicle isn't owned directly by an agent — it's reached through whichever
// customer/company it's on file for, and that party has to be one of this agent's.
async function agentCanEditVehicle(agentId, vehicleId) {
  const owned = await prisma.partyVehicle.findFirst({
    where: {
      vehicle_id: vehicleId,
      ownership_end_date: null,
      OR: [
        { customer: { customer_agents: { some: { agent_id: agentId } } } },
        { company: { company_agents: { some: { agent_id: agentId } } } },
      ],
    },
  });
  return Boolean(owned);
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

    const {
      plate_number,
      mv_file_no,
      engine_number,
      chassis_number,
      product_variant_id,
      make,
      model,
      year_model,
      vehicle_type,
      color,
      no_of_seats,
      estimated_value,
    } = req.body;

    if (product_variant_id !== undefined) {
      const productVariant = await prisma.productVariant.findUnique({
        where: { id: product_variant_id },
        select: { insurance_class: { select: { class_name: true } } },
      });
      if (!productVariant) {
        return res.status(400).json({ error: "product_variant_id does not match an existing product" });
      }
      if (productVariant.insurance_class.class_name !== "Motor") {
        return res.status(400).json({ error: "A vehicle can only be insured under a Motor product variant" });
      }
    }

    // Once a vehicle has ever been assessed, both the value and the date are
    // frozen — the value only ever moves through automatic depreciation from
    // here on, never a direct edit, no matter what the client sends.
    const current = await prisma.vehicle.findUnique({
      where: { id },
      select: { estimated_value: true, initial_assessment_date: true, plate_number: true },
    });
    const alreadyAssessed = Boolean(current?.initial_assessment_date);

    // This is the one legitimate place a plate number can ever change (a
    // genuine data-entry correction) — everywhere else (reassigning a
    // vehicle to a new owner/agent) leaves it untouched, see
    // policyApplications.js/policyQuotations.js's own reassign_owner
    // branches. Since it's changing here, it must be re-checked the same way
    // a brand-new vehicle's plate is, so a "correction" can't silently
    // collide with a different, already-on-file vehicle.
    const plateChanged = plate_number && current?.plate_number !== plate_number;
    if (plateChanged) {
      const duplicate = await prisma.vehicle.findFirst({
        where: { plate_number: { equals: plate_number, mode: "insensitive" }, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) {
        return res.status(409).json({ error: `Plate number ${plate_number} is already on file for another vehicle` });
      }
    }

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        plate_number,
        mv_file_no,
        engine_number,
        chassis_number,
        ...(product_variant_id !== undefined ? { product_variant_id } : {}),
        make: make || null,
        model: model || null,
        year_model: year_model ?? null,
        vehicle_type: vehicle_type || null,
        color: color || null,
        no_of_seats,
        estimated_value: alreadyAssessed ? current.estimated_value : (estimated_value ?? null),
        initial_assessment_date: alreadyAssessed
          ? current.initial_assessment_date
          : estimated_value !== undefined
            ? new Date()
            : null,
      },
    });

    res.json(vehicle);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
