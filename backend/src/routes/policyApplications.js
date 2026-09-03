const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, getUserPermissionCodes } = require("../middleware/permissions");

const router = express.Router();

router.use(requireAuth, requirePermission("CREATE_APPLICATION"));

// Standard Philippine non-life insurance statutory rates, applied to total premium.
const DOC_STAMPS_RATE = 0.125;
const VAT_RATE = 0.12;
const LGT_RATE = 0.002;

function round2(n) {
  return Math.round(n * 100) / 100;
}

const PAYMENT_METHODS = ["CASH", "CHECK", "CREDIT_CARD", "BANK_TRANSFER", "ONLINE_PAYMENT"];
const PAYMENT_REMITTANCES = ["DIRECT_TO_BETHEL", "THROUGH_AGENT"];

function generateApplicationNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `APP-${datePart}-${randomPart}`;
}

router.post("/", async (req, res, next) => {
  try {
    // CREATE_APPLICATION covers the page itself (browsing the catalog, your
    // customers/companies); actually issuing an application needs its own grant.
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!actingPermissions.has("AGENT_ISSUANCE")) {
      return res.status(403).json({ error: "Missing required permission: AGENT_ISSUANCE" });
    }

    const {
      insured_type,
      customer_id,
      company_id,
      product_variant_id,
      coverage_start_at,
      coverage_end_at,
      coverages,
      vehicles,
      risk_address,
      insured_address,
      remarks,
      misc,
      send_policy_to_email,
      payment_method,
      payment_remittance,
      bethel_payment_method_id,
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
    if (!PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({ error: `payment_method must be one of: ${PAYMENT_METHODS.join(", ")}` });
    }
    if (!PAYMENT_REMITTANCES.includes(payment_remittance)) {
      return res
        .status(400)
        .json({ error: `payment_remittance must be one of: ${PAYMENT_REMITTANCES.join(", ")}` });
    }
    if (payment_remittance === "DIRECT_TO_BETHEL" && !bethel_payment_method_id) {
      return res.status(400).json({ error: "bethel_payment_method_id is required when payment goes directly to Bethel" });
    }
    let bethelPaymentMethod = null;
    if (bethel_payment_method_id) {
      bethelPaymentMethod = await prisma.authorizedPaymentMethod.findUnique({ where: { id: bethel_payment_method_id } });
      if (!bethelPaymentMethod) {
        return res.status(400).json({ error: "bethel_payment_method_id does not match an existing payment method" });
      }
    }

    const productVariant = await prisma.productVariant.findUnique({
      where: { id: product_variant_id },
      select: { insurance_class: { select: { class_name: true } } },
    });
    if (!productVariant) {
      return res.status(400).json({ error: "product_variant_id does not match an existing product" });
    }
    const className = productVariant.insurance_class.class_name;
    // Property carries its own risk location, separate from the address the
    // policy is actually named on; Motor only ever needs the latter.
    const requiresRiskAddress = className === "Property";
    const requiresInsuredAddress = className === "Motor" || className === "Property";

    // What's required depends entirely on the insurance class, not the client's say-so.
    if (className === "Motor") {
      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        return res.status(400).json({ error: "At least one vehicle is required for Motor applications" });
      }
      for (const v of vehicles) {
        if (!v.plate_number || !v.mv_file_no || !v.engine_number || !v.chassis_number) {
          return res
            .status(400)
            .json({ error: "Every vehicle needs a plate number, MV file number, engine number, and chassis number" });
        }
      }
    }
    if (requiresRiskAddress) {
      if (!risk_address || !risk_address.address_line_1 || !risk_address.city || !risk_address.province) {
        return res.status(400).json({ error: "Risk address line 1, city, and province are required" });
      }
    }
    if (requiresInsuredAddress) {
      if (!insured_address || !insured_address.address_line_1 || !insured_address.city || !insured_address.province) {
        return res.status(400).json({ error: "Insured address line 1, city, and province are required" });
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

    // Every coverage has a floor price: the agent's own net rate if they've been
    // given one for it, otherwise the product's standard rate. The premium the
    // agent charges can't come in under that floor, and coverage can't exceed
    // whichever maximum applies (agent-specific override, else the product's own).
    const coverageIds = coverages.map((c) => c.coverage_id);
    const coverageDetails = await prisma.productCoverage.findMany({
      where: { id: { in: coverageIds } },
      select: { id: true, coverage_name: true, maximum_coverage: true, standard_rate: true },
    });
    const coverageById = new Map(coverageDetails.map((c) => [c.id, c]));
    if (coverageDetails.length !== new Set(coverageIds).size) {
      return res.status(400).json({ error: "One or more coverages do not exist" });
    }

    const netrateOverrides = await prisma.agentNetrate.findMany({
      where: { agent_id: user.agent_id, product_coverage_id: { in: coverageIds } },
      select: { product_coverage_id: true, netrate: true, maximum_coverage: true },
    });
    const overrideByCoverageId = new Map(netrateOverrides.map((o) => [o.product_coverage_id, o]));

    // Captured per coverage so the transaction below can freeze the rate that was
    // actually in effect at submission time, regardless of what it becomes later.
    const effectiveRateByCoverageId = new Map();

    for (const c of coverages) {
      const coverage = coverageById.get(c.coverage_id);
      const override = overrideByCoverageId.get(c.coverage_id);
      const effectiveRate = override ? Number(override.netrate) : Number(coverage.standard_rate);
      const effectiveMax =
        override && override.maximum_coverage !== null
          ? Number(override.maximum_coverage)
          : Number(coverage.maximum_coverage);
      effectiveRateByCoverageId.set(c.coverage_id, effectiveRate);

      const coverageAmount = Number(c.coverage_amount);
      const premiumAmount = Number(c.premium_amount);

      if (coverageAmount > effectiveMax) {
        return res.status(400).json({
          error: `Coverage amount for ${coverage.coverage_name} exceeds the maximum of ₱${effectiveMax.toLocaleString()}`,
        });
      }
      const minimumPremium = coverageAmount * effectiveRate;
      if (premiumAmount < minimumPremium) {
        return res.status(400).json({
          error: `Premium amount for ${coverage.coverage_name} is below the required minimum of ₱${minimumPremium.toLocaleString(undefined, { maximumFractionDigits: 2 })} at your net rate`,
        });
      }
    }

    // Total premium is just the sum of every coverage's premium — statutory
    // charges are computed from that, and misc is whatever flat amount was entered.
    const totalPremium = round2(coverages.reduce((sum, c) => sum + Number(c.premium_amount), 0));
    const docStamps = round2(totalPremium * DOC_STAMPS_RATE);
    const vat = round2(totalPremium * VAT_RATE);
    const lgt = round2(totalPremium * LGT_RATE);
    const miscAmount = round2(Number(misc) || 0);
    const totalAmount = round2(totalPremium + docStamps + vat + lgt + miscAmount);

    let companyNameSnapshot = null;
    if (insured_type === "CORPORATE") {
      const company = await prisma.company.findUnique({ where: { id: company_id } });
      if (!company) {
        return res.status(400).json({ error: "company_id does not match an existing company" });
      }
      companyNameSnapshot = company.company_name;
    }

    // Verify any "reuse this existing vehicle/address" ids are actually on file for
    // this customer/company before the transaction, so a bad id fails cleanly with 400.
    if (className === "Motor") {
      for (const v of vehicles) {
        if (!v.existing_vehicle_id) continue;
        const owned =
          insured_type === "INDIVIDUAL"
            ? await prisma.customerVehicle.findFirst({
                where: { customer_id, vehicle_id: v.existing_vehicle_id },
              })
            : await prisma.companyVehicle.findFirst({
                where: { company_id, vehicle_id: v.existing_vehicle_id },
              });
        if (!owned) {
          return res.status(400).json({ error: "One of the selected vehicles is not on file for this customer/company" });
        }
      }
    }
    async function isAddressOwned(existingAddressId) {
      const owned =
        insured_type === "INDIVIDUAL"
          ? await prisma.customerAddress.findFirst({ where: { customer_id, address_id: existingAddressId } })
          : await prisma.companyAddress.findFirst({ where: { company_id, address_id: existingAddressId } });
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
          total_premium: totalPremium,
          doc_stamps: docStamps,
          vat,
          lgt,
          misc: miscAmount,
          total_amount: totalAmount,
          send_policy_to_email: Boolean(send_policy_to_email),
          payment_method,
          payment_remittance,
          bethel_payment_method_id: bethelPaymentMethod ? bethelPaymentMethod.id : null,
          remarks: remarks || null,
        },
      });

      await tx.applicationCoverage.createMany({
        data: coverages.map((c) => ({
          application_id: application.id,
          coverage_id: c.coverage_id,
          coverage_amount: c.coverage_amount,
          premium_amount: c.premium_amount,
          applied_rate: effectiveRateByCoverageId.get(c.coverage_id),
        })),
      });

      if (className === "Motor") {
        for (const v of vehicles) {
          let vehicleId = null;

          if (v.existing_vehicle_id) {
            // Already verified as on-file for this customer/company above — just reuse it.
            vehicleId = v.existing_vehicle_id;
          } else {
            const createdVehicle = await tx.vehicle.create({
              data: {
                plate_number: v.plate_number,
                mv_file_no: v.mv_file_no,
                engine_number: v.engine_number,
                chassis_number: v.chassis_number,
                make: v.make || null,
                model: v.model || null,
                year_model: v.year_model ? Number(v.year_model) : null,
                vehicle_type: v.vehicle_type || null,
                color: v.color || null,
              },
            });
            vehicleId = createdVehicle.id;

            if (insured_type === "INDIVIDUAL") {
              await tx.customerVehicle.create({
                data: { customer_id, vehicle_id: vehicleId, ownership_start_date: new Date() },
              });
            } else {
              await tx.companyVehicle.create({
                data: { company_id, vehicle_id: vehicleId, ownership_start_date: new Date() },
              });
            }
          }

          await tx.policyApplicationVehicle.create({
            data: { policy_application_id: application.id, vehicle_id: vehicleId },
          });
        }
      }

      async function resolveAddressId(addr, addressType) {
        if (addr.existing_address_id) {
          // Already verified as on-file for this customer/company above — just reuse it.
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

        // New addresses created inline get linked to the party too, same as a
        // new vehicle does, so they're available to pick from next time.
        if (insured_type === "INDIVIDUAL") {
          await tx.customerAddress.create({ data: { customer_id, address_id: createdAddress.id } });
        } else {
          await tx.companyAddress.create({ data: { company_id, address_id: createdAddress.id } });
        }
        return createdAddress.id;
      }

      if (requiresRiskAddress) {
        const addressId = await resolveAddressId(risk_address, "RISK_LOCATION");
        await tx.policyApplicationAddress.create({
          data: { policy_application_id: application.id, address_id: addressId, role: "RISK" },
        });
      }
      if (requiresInsuredAddress) {
        const addressId = await resolveAddressId(insured_address, "RESIDENTIAL");
        await tx.policyApplicationAddress.create({
          data: { policy_application_id: application.id, address_id: addressId, role: "INSURED" },
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
