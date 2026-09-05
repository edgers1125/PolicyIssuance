const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, ensurePermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody } = require("../middleware/validate");
const { createApplicationSchema } = require("../schemas/policyApplications");

const router = express.Router();

router.use(requireAuth, requirePermission("CREATE_APPLICATION"));

// Standard Philippine non-life insurance statutory rates, applied to total premium.
const DOC_STAMPS_RATE = 0.125;
const VAT_RATE = 0.12;
const LGT_RATE = 0.002;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function generateApplicationNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `APP-${datePart}-${randomPart}`;
}

router.post("/", validateBody(createApplicationSchema), async (req, res, next) => {
  try {
    // CREATE_APPLICATION covers the page itself (browsing the catalog, your
    // customers/companies); actually issuing an application needs its own grant.
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensurePermission(res, actingPermissions, "AGENT_ISSUANCE")) return;

    const {
      insured_type,
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
      payment_method,
      payment_remittance,
      bethel_payment_method_id,
    } = req.body;

    // bethel_payment_method_id's presence-when-required was already checked by
    // the schema — this just confirms the id it gave actually exists.
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

    // What's required depends entirely on the insurance class, not the client's
    // say-so — the schema already validated the shape of vehicles/addresses
    // wherever they were given, this just enforces whether they had to be.
    if (className === "Motor" && (!Array.isArray(vehicles) || vehicles.length === 0)) {
      return res.status(400).json({ error: "At least one vehicle is required for Motor applications" });
    }
    if (requiresRiskAddress && !risk_address) {
      return res.status(400).json({ error: "A risk address is required for Property applications" });
    }
    if (requiresInsuredAddress && !insured_address) {
      return res.status(400).json({ error: "An insured address is required for this application" });
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

      const coverageAmount = c.coverage_amount;
      const premiumAmount = c.premium_amount;

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
    const totalPremium = round2(coverages.reduce((sum, c) => sum + c.premium_amount, 0));
    const docStamps = round2(totalPremium * DOC_STAMPS_RATE);
    const vat = round2(totalPremium * VAT_RATE);
    const lgt = round2(totalPremium * LGT_RATE);
    const miscAmount = round2(misc || 0);
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

        if (v.reassign_owner) {
          // Confirmed by the agent as belonging to (or about to belong to) this
          // party — who currently owns it doesn't matter, that's what's changing.
          const vehicleExists = await prisma.vehicle.findUnique({ where: { id: v.existing_vehicle_id } });
          if (!vehicleExists) {
            return res.status(400).json({ error: "One of the selected vehicles no longer exists" });
          }
          continue;
        }

        const owned =
          insured_type === "INDIVIDUAL"
            ? await prisma.customerVehicle.findFirst({
                where: { customer_id, vehicle_id: v.existing_vehicle_id, ownership_end_date: null },
              })
            : await prisma.companyVehicle.findFirst({
                where: { company_id, vehicle_id: v.existing_vehicle_id, ownership_end_date: null },
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
            vehicleId = v.existing_vehicle_id;

            if (v.reassign_owner) {
              // The agent may have corrected/updated details while confirming
              // the match — persist those before moving ownership over.
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
                },
              });

              // Treated as sold: close out whichever active ownership link it
              // had (kept for history, not deleted), then open a new one for
              // this application's party.
              await tx.customerVehicle.updateMany({
                where: { vehicle_id: vehicleId, ownership_end_date: null },
                data: { ownership_end_date: new Date() },
              });
              await tx.companyVehicle.updateMany({
                where: { vehicle_id: vehicleId, ownership_end_date: null },
                data: { ownership_end_date: new Date() },
              });

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
            // else: already verified as on-file for this customer/company above — just reuse it as-is.
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
