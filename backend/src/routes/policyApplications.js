const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

const router = express.Router();

router.use(requireAuth, requirePermission("CREATE_APPLICATION"));

function generateApplicationNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `APP-${datePart}-${randomPart}`;
}

router.post("/", async (req, res, next) => {
  try {
    const {
      insured_type,
      customer_id,
      company_id,
      product_variant_id,
      coverage_start_at,
      coverage_end_at,
      coverages,
      vehicles,
      address,
      remarks,
    } = req.body;

    if (insured_type !== "INDIVIDUAL" && insured_type !== "CORPORATE") {
      return res.status(400).json({ error: "insured_type must be INDIVIDUAL or CORPORATE" });
    }
    if (insured_type === "INDIVIDUAL" && !customer_id) {
      return res.status(400).json({ error: "customer_id is required for an individual application" });
    }
    if (insured_type === "CORPORATE" && !company_id) {
      return res.status(400).json({ error: "company_id is required for a corporate application" });
    }
    if (!product_variant_id) {
      return res.status(400).json({ error: "product_variant_id is required" });
    }
    if (!coverage_start_at || !coverage_end_at) {
      return res.status(400).json({ error: "coverage_start_at and coverage_end_at are required" });
    }
    const startAt = new Date(coverage_start_at);
    const endAt = new Date(coverage_end_at);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return res.status(400).json({ error: "coverage_start_at / coverage_end_at are not valid dates" });
    }
    if (endAt <= startAt) {
      return res.status(400).json({ error: "coverage_end_at must be after coverage_start_at" });
    }
    if (!Array.isArray(coverages) || coverages.length === 0) {
      return res.status(400).json({ error: "At least one coverage must be selected" });
    }

    const productVariant = await prisma.productVariant.findUnique({
      where: { id: product_variant_id },
      select: { insurance_class: { select: { class_name: true } } },
    });
    if (!productVariant) {
      return res.status(400).json({ error: "product_variant_id does not match an existing product" });
    }
    const className = productVariant.insurance_class.class_name;

    // What's required depends entirely on the insurance class, not the client's say-so.
    if (className === "Motor") {
      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        return res.status(400).json({ error: "At least one vehicle is required for Motor applications" });
      }
      for (const v of vehicles) {
        if (!v.plate_number || !v.engine_number || !v.chassis_number) {
          return res.status(400).json({ error: "Every vehicle needs a plate, engine, and chassis number" });
        }
      }
    }
    if (className === "Property") {
      if (!address || !address.address_line_1 || !address.city || !address.province) {
        return res.status(400).json({ error: "Address line 1, city, and province are required for Property applications" });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { agent_id: true },
    });
    if (!user?.agent_id) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }
    const agent = await prisma.agent.findUnique({ where: { id: user.agent_id } });

    // The agent can only file applications for their own connected customers/companies.
    if (insured_type === "INDIVIDUAL") {
      const link = await prisma.customerAgent.findUnique({
        where: { customer_id_agent_id: { customer_id, agent_id: agent.id } },
      });
      if (!link) {
        return res.status(403).json({ error: "This customer isn't connected to your agent account" });
      }
    } else {
      const link = await prisma.companyAgent.findUnique({
        where: { company_id_agent_id: { company_id, agent_id: agent.id } },
      });
      if (!link) {
        return res.status(403).json({ error: "This company isn't connected to your agent account" });
      }
    }

    let companyNameSnapshot = null;
    if (insured_type === "CORPORATE") {
      const company = await prisma.company.findUnique({ where: { id: company_id } });
      if (!company) {
        return res.status(400).json({ error: "company_id does not match an existing company" });
      }
      companyNameSnapshot = company.company_name;
    }

    const result = await prisma.$transaction(async (tx) => {
      const application = await tx.policyApplication.create({
        data: {
          insured_type,
          application_number: generateApplicationNumber(),
          customer_id: insured_type === "INDIVIDUAL" ? customer_id : null,
          company_id: insured_type === "CORPORATE" ? company_id : null,
          company_name_snapshot: companyNameSnapshot,
          agent_id: agent.id,
          agent_name_snapshot: agent.agent_name,
          product_variant_id,
          coverage_start_at: startAt,
          coverage_end_at: endAt,
          application_date: new Date(),
          submission_date: new Date(),
          status: "SUBMITTED",
          remarks: remarks || null,
        },
      });

      await tx.applicationCoverage.createMany({
        data: coverages.map((c) => ({
          application_id: application.id,
          coverage_id: c.coverage_id,
          coverage_amount: c.coverage_amount,
          premium_amount: c.premium_amount,
        })),
      });

      if (className === "Motor") {
        for (const v of vehicles) {
          const createdVehicle = await tx.vehicle.create({
            data: {
              plate_number: v.plate_number,
              engine_number: v.engine_number,
              chassis_number: v.chassis_number,
              make: v.make || null,
              model: v.model || null,
              year_model: v.year_model ? Number(v.year_model) : null,
              vehicle_type: v.vehicle_type || null,
              color: v.color || null,
            },
          });

          await tx.policyApplicationVehicle.create({
            data: { policy_application_id: application.id, vehicle_id: createdVehicle.id },
          });

          if (insured_type === "INDIVIDUAL") {
            await tx.customerVehicle.create({
              data: { customer_id, vehicle_id: createdVehicle.id, ownership_start_date: new Date() },
            });
          } else {
            await tx.companyVehicle.create({
              data: { company_id, vehicle_id: createdVehicle.id, ownership_start_date: new Date() },
            });
          }
        }
      }

      if (className === "Property") {
        const createdAddress = await tx.address.create({
          data: {
            address_line_1: address.address_line_1,
            address_line_2: address.address_line_2 || null,
            barangay: address.barangay || null,
            city: address.city,
            province: address.province,
            postal_code: address.postal_code || null,
            country: address.country || "Philippines",
            address_type: "RISK_LOCATION",
          },
        });

        await tx.policyApplicationAddress.create({
          data: { policy_application_id: application.id, address_id: createdAddress.id },
        });
      }

      return application;
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
