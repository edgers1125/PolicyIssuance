const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateBody, validateQuery } = require("../middleware/validate");
const { createQuotationSchema, listQuotationsQuerySchema } = require("../schemas/policyQuotations");
const { currentVehicleValue } = require("../lib/vehicleValue");
const { round2, resolveCoverageRows } = require("../lib/coveragePricing");
const { sendIfHttpError } = require("../lib/httpError");

const router = express.Router();

// A quotation only needs the base CREATE_APPLICATION grant (the same one
// that covers browsing the catalog and your customers/companies) — unlike an
// application, drafting a quotation isn't "issuing" anything, so it doesn't
// need CREATE_APPLICATION.AGENT_ISSUANCE.
router.use(requireAuth, requirePermission("CREATE_APPLICATION"));

const DOC_STAMPS_RATE = 0.125;
const VAT_RATE = 0.12;
const LGT_RATE = 0.002;

function generateQuotationNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `QUO-${datePart}-${randomPart}`;
}

// Every quotation this agent has drafted, latest first — the Quotation
// Tracker's list view.
router.get("/", validateQuery(listQuotationsQuerySchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { agent_id: true } });
    if (!user?.agent_id) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const { page, page_size: pageSize } = req.query;
    const where = { agent_id: user.agent_id };

    const [total, quotations] = await Promise.all([
      prisma.policyQuotation.count({ where }),
      prisma.policyQuotation.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          quotation_number: true,
          insured_type: true,
          quotation_date: true,
          coverage_start_at: true,
          coverage_end_at: true,
          total_premium: true,
          created_at: true,
          customer: { select: { first_name: true, last_name: true } },
          company_name_snapshot: true,
          product_variant: {
            select: { variant_name: true, insurance_class: { select: { class_name: true } } },
          },
        },
      }),
    ]);

    res.json({
      data: quotations.map((q) => ({
        id: q.id,
        quotation_number: q.quotation_number,
        insured_name:
          q.insured_type === "INDIVIDUAL"
            ? [q.customer?.last_name, q.customer?.first_name].filter(Boolean).join(", ")
            : q.company_name_snapshot,
        class_name: q.product_variant.insurance_class.class_name,
        variant_name: q.product_variant.variant_name,
        coverage_start_at: q.coverage_start_at,
        coverage_end_at: q.coverage_end_at,
        total_premium: q.total_premium,
        created_at: q.created_at,
      })),
      total,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", validateBody(createQuotationSchema), async (req, res, next) => {
  try {
    const {
      customer_id,
      company_id,
      product_variant_id,
      coverage_start_at: startAt,
      coverage_end_at: endAt,
      coverages,
      vehicles,
      risk_address,
      insured_address,
      remarks,
      misc,
      send_policy_to_email,
    } = req.body;

    const insured_type = customer_id ? "INDIVIDUAL" : "CORPORATE";
    const partyIdFields =
      insured_type === "INDIVIDUAL" ? { customer_id, company_id: null } : { customer_id: null, company_id };

    const productVariant = await prisma.productVariant.findUnique({
      where: { id: product_variant_id },
      select: { insurance_class: { select: { class_name: true } } },
    });
    if (!productVariant) {
      return res.status(400).json({ error: "product_variant_id does not match an existing product" });
    }
    const className = productVariant.insurance_class.class_name;
    const requiresRiskAddress = className === "Property";
    const requiresInsuredAddress = className === "Motor" || className === "Property";

    if (className === "Motor" && (!Array.isArray(vehicles) || vehicles.length === 0)) {
      return res.status(400).json({ error: "At least one vehicle is required for Motor quotations" });
    }
    if (requiresRiskAddress && !risk_address) {
      return res.status(400).json({ error: "A risk address is required for Property quotations" });
    }
    if (requiresInsuredAddress && !insured_address) {
      return res.status(400).json({ error: "An insured address is required for this quotation" });
    }

    async function resolveVehicleValue(v) {
      if (!v) return null;
      if (v.existing_vehicle_id) {
        const dbVehicle = await prisma.vehicle.findUnique({
          where: { id: v.existing_vehicle_id },
          select: { estimated_value: true, initial_assessment_date: true },
        });
        return currentVehicleValue(dbVehicle?.estimated_value, dbVehicle?.initial_assessment_date);
      }
      if (v.estimated_value !== undefined) {
        return currentVehicleValue(v.estimated_value, new Date());
      }
      return null;
    }
    const vehicleValues = className === "Motor" ? await Promise.all(vehicles.map(resolveVehicleValue)) : [];

    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { agent_id: true } });
    if (!user?.agent_id) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }
    const agent = await prisma.agent.findUnique({ where: { id: user.agent_id } });

    // Same connected-party restriction as an application — an agent can only
    // quote for their own connected customers/companies.
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

    const resolvedRows = await resolveCoverageRows({
      coverages,
      className,
      vehicles,
      vehicleValues,
      agentId: user.agent_id,
      startAt,
      endAt,
    });

    const totalPremium = round2(resolvedRows.reduce((sum, r) => sum + r.premium_amount, 0));
    const docStamps = round2(totalPremium * DOC_STAMPS_RATE);
    const vat = round2(totalPremium * VAT_RATE);
    const lgt = round2(totalPremium * LGT_RATE);
    const miscAmount = round2(misc || 0);

    let companyNameSnapshot = null;
    if (insured_type === "CORPORATE") {
      const company = await prisma.company.findUnique({ where: { id: company_id } });
      if (!company) {
        return res.status(400).json({ error: "company_id does not match an existing company" });
      }
      companyNameSnapshot = company.company_name;
    }

    if (className === "Motor") {
      for (const v of vehicles) {
        if (!v.existing_vehicle_id) continue;

        if (v.reassign_owner) {
          const vehicleExists = await prisma.vehicle.findUnique({ where: { id: v.existing_vehicle_id } });
          if (!vehicleExists) {
            return res.status(400).json({ error: "One of the selected vehicles no longer exists" });
          }
          continue;
        }

        const owned = await prisma.partyVehicle.findFirst({
          where: { ...partyIdFields, vehicle_id: v.existing_vehicle_id, ownership_end_date: null },
        });
        if (!owned) {
          return res.status(400).json({ error: "One of the selected vehicles is not on file for this customer/company" });
        }
      }
    }
    async function isAddressOwned(existingAddressId) {
      const owned = await prisma.partyAddress.findFirst({
        where: { ...partyIdFields, address_id: existingAddressId },
      });
      return Boolean(owned);
    }

    if (requiresRiskAddress && risk_address.existing_address_id && !(await isAddressOwned(risk_address.existing_address_id))) {
      return res.status(400).json({ error: "The selected risk address is not on file for this customer/company" });
    }
    if (
      requiresInsuredAddress &&
      insured_address.existing_address_id &&
      !(await isAddressOwned(insured_address.existing_address_id))
    ) {
      return res.status(400).json({ error: "The selected insured address is not on file for this customer/company" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const quotation = await tx.policyQuotation.create({
        data: {
          insured_type,
          quotation_number: generateQuotationNumber(),
          customer_id: insured_type === "INDIVIDUAL" ? customer_id : null,
          company_id: insured_type === "CORPORATE" ? company_id : null,
          company_name_snapshot: companyNameSnapshot,
          agent_id: agent.id,
          agent_name_snapshot: agent.agent_name,
          product_variant_id,
          coverage_start_at: startAt,
          coverage_end_at: endAt,
          quotation_date: new Date(),
          total_premium: totalPremium,
          doc_stamps: docStamps,
          vat,
          lgt,
          misc: miscAmount,
          send_policy_to_email: Boolean(send_policy_to_email),
          remarks: remarks || null,
        },
      });

      // Same vehicle-resolution dance as an application — a brand-new
      // vehicle is created fresh, an existing one is reused (and optionally
      // reassigned to this party), then joined onto the quotation in the
      // same order as `vehicles` so a coverage's vehicle_index maps onto it.
      const policyQuotationVehicleIds = [];

      if (className === "Motor") {
        for (const v of vehicles) {
          let vehicleId = null;

          if (v.existing_vehicle_id) {
            vehicleId = v.existing_vehicle_id;

            if (v.reassign_owner) {
              const currentVehicle = await tx.vehicle.findUnique({
                where: { id: vehicleId },
                select: { estimated_value: true, initial_assessment_date: true },
              });
              const alreadyAssessed = Boolean(currentVehicle?.initial_assessment_date);
              await tx.vehicle.update({
                where: { id: vehicleId },
                data: {
                  plate_number: v.plate_number,
                  mv_file_no: v.mv_file_no,
                  engine_number: v.engine_number,
                  chassis_number: v.chassis_number,
                  make: v.make || null,
                  model: v.model || null,
                  year_model: v.year_model ?? null,
                  vehicle_type: v.vehicle_type || null,
                  color: v.color || null,
                  estimated_value: alreadyAssessed ? currentVehicle.estimated_value : (v.estimated_value ?? null),
                  initial_assessment_date: alreadyAssessed
                    ? currentVehicle.initial_assessment_date
                    : v.estimated_value !== undefined
                      ? new Date()
                      : null,
                },
              });

              await tx.partyVehicle.updateMany({
                where: { vehicle_id: vehicleId, ownership_end_date: null },
                data: { ownership_end_date: new Date() },
              });

              await tx.partyVehicle.create({
                data: { ...partyIdFields, vehicle_id: vehicleId, ownership_start_date: new Date() },
              });
            }
          } else {
            const createdVehicle = await tx.vehicle.create({
              data: {
                plate_number: v.plate_number,
                mv_file_no: v.mv_file_no,
                engine_number: v.engine_number,
                chassis_number: v.chassis_number,
                make: v.make || null,
                model: v.model || null,
                year_model: v.year_model ?? null,
                vehicle_type: v.vehicle_type || null,
                color: v.color || null,
                estimated_value: v.estimated_value ?? null,
                initial_assessment_date: v.estimated_value !== undefined ? new Date() : null,
              },
            });
            vehicleId = createdVehicle.id;

            await tx.partyVehicle.create({
              data: { ...partyIdFields, vehicle_id: vehicleId, ownership_start_date: new Date() },
            });
          }

          const policyQuotationVehicle = await tx.policyQuotationVehicle.create({
            data: { policy_quotation_id: quotation.id, vehicle_id: vehicleId },
          });
          policyQuotationVehicleIds.push(policyQuotationVehicle.id);
        }
      }

      await tx.quotationCoverage.createMany({
        data: resolvedRows.map((r) => ({
          quotation_id: quotation.id,
          coverage_id: r.coverage_id,
          policy_quotation_vehicle_id: r.vehicle_index !== null ? policyQuotationVehicleIds[r.vehicle_index] : null,
          coverage_amount: r.coverage_amount,
          premium_amount: r.premium_amount,
          payable_to_bethel: r.payable_to_bethel,
          applied_rate: r.applied_rate,
        })),
      });

      async function resolveAddressId(addr, addressType) {
        if (addr.existing_address_id) {
          return addr.existing_address_id;
        }
        const createdAddress = await tx.address.create({
          data: {
            address_line_1: addr.address_line_1,
            address_line_2: addr.address_line_2 || null,
            barangay: addr.barangay || null,
            city: addr.city,
            province: addr.province,
            postal_code: addr.postal_code || null,
            country: addr.country || "Philippines",
            address_type: addressType,
          },
        });

        await tx.partyAddress.create({ data: { ...partyIdFields, address_id: createdAddress.id } });
        return createdAddress.id;
      }

      if (requiresRiskAddress) {
        const addressId = await resolveAddressId(risk_address, "RISK_LOCATION");
        await tx.policyQuotationAddress.create({
          data: { policy_quotation_id: quotation.id, address_id: addressId, role: "RISK" },
        });
      }
      if (requiresInsuredAddress) {
        const addressId = await resolveAddressId(insured_address, "RESIDENTIAL");
        await tx.policyQuotationAddress.create({
          data: { policy_quotation_id: quotation.id, address_id: addressId, role: "INSURED" },
        });
      }

      return quotation;
    });

    res.status(201).json(result);
  } catch (err) {
    if (sendIfHttpError(err, res)) return;
    next(err);
  }
});

module.exports = router;
