const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, ensurePermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody, validateQuery, validateParams } = require("../middleware/validate");
const {
  createApplicationSchema,
  listApplicationsQuerySchema,
  applicationIdParamSchema,
} = require("../schemas/policyApplications");
const { documentPreviewPropsSchema } = require("../schemas/policyIntakeShared");
const { CLAUSE_CHANGE_TYPES } = require("../schemas/policyApplicationChanges");
const { currentVehicleValue } = require("../lib/vehicleValue");
const { getAccessibleAgentIds } = require("../lib/agent");
const { round2, resolveCoverageRows } = require("../lib/coveragePricing");
const { resolveVehicleRenewal, resolveRiskAddressRenewal } = require("../lib/policyConflicts");
const { sendIfHttpError } = require("../lib/httpError");
const { sendMail } = require("../lib/mailer");
const { buildSubmissionEmailContent } = require("../lib/applicationEmails");
const { buildPolicyApplicationPdf } = require("../pdf/policyApplicationPdf");

const router = express.Router();

router.use(requireAuth, requirePermission("CREATE_APPLICATION"));

// Standard Philippine non-life insurance statutory rates, applied to total premium.
const DOC_STAMPS_RATE = 0.125;
const VAT_RATE = 0.12;
const LGT_RATE = 0.002;

function generateApplicationNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `APP-${datePart}-${randomPart}`;
}

// Every application this agent has filed, latest first — the Policy
// Applications tracker's list view (same shape/pattern as
// GET /policy-quotations).
router.get("/", validateQuery(listApplicationsQuerySchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { agent_id: true } });
    if (!user?.agent_id) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const { page, page_size: pageSize, search, status, policy_type, class_id } = req.query;
    const where = {
      agent_id: user.agent_id,
      ...(status ? { status } : {}),
      ...(policy_type ? { policy_type } : {}),
      ...(class_id ? { product_variant: { insurance_class_id: class_id } } : {}),
      ...(search
        ? {
            OR: [
              { application_number: { contains: search, mode: "insensitive" } },
              { company_name_snapshot: { contains: search, mode: "insensitive" } },
              { customer: { first_name: { contains: search, mode: "insensitive" } } },
              { customer: { last_name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, applications] = await Promise.all([
      prisma.policyApplication.count({ where }),
      prisma.policyApplication.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          application_number: true,
          insured_type: true,
          status: true,
          policy_type: true,
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
      data: applications.map((a) => ({
        id: a.id,
        application_number: a.application_number,
        insured_name:
          a.insured_type === "INDIVIDUAL"
            ? [a.customer?.last_name, a.customer?.first_name].filter(Boolean).join(", ")
            : a.company_name_snapshot,
        class_name: a.product_variant.insurance_class.class_name,
        variant_name: a.product_variant.variant_name,
        status: a.status,
        policy_type: a.policy_type,
        coverage_start_at: a.coverage_start_at,
        coverage_end_at: a.coverage_end_at,
        total_premium: a.total_premium,
        created_at: a.created_at,
      })),
      total,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", validateBody(createApplicationSchema), async (req, res, next) => {
  try {
    // CREATE_APPLICATION covers the page itself (browsing the catalog, your
    // customers/companies); actually issuing an application needs its own grant.
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensurePermission(res, actingPermissions, "CREATE_APPLICATION.AGENT_ISSUANCE")) return;

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
      send_policy_to_email,
      send_policy_to_email_on_approval,
      payment_method,
      payment_remittance,
      bethel_payment_method_id,
      renewed_policy_id,
    } = req.body;

    // Which one applies is derived from whichever id was actually sent — the
    // schema already enforced that exactly one of the two is present.
    const insured_type = customer_id ? "INDIVIDUAL" : "CORPORATE";

    // The single pair of conditionally-null party fields every
    // PartyVehicle/PartyAddress create call below needs — computed once
    // since which one is set never changes within a single application.
    const partyIdFields =
      insured_type === "INDIVIDUAL" ? { customer_id, company_id: null } : { customer_id: null, company_id };

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
      select: { misc_fee: true, insurance_class: { select: { class_name: true } } },
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

    // VALUE_PERCENTAGE coverages price off whichever vehicle they're scoped
    // to (or the primary/first vehicle, for one that applies to the whole
    // policy) — for an existing vehicle this is looked up fresh from the
    // database (its value/date are frozen once assessed, so this is the
    // authoritative figure); a brand-new vehicle is being assessed for the
    // first time right now, so "now" is its assessment date.
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

    // VALUE_PERCENTAGE coverages on a Property application price off the
    // risk address's own estimated value instead — same "existing record is
    // authoritative, new one uses what was just entered" split as vehicles,
    // just without a depreciation schedule (a property's value doesn't decay
    // automatically the way a vehicle's does).
    async function resolveRiskAddressValue(addr) {
      if (!addr) return null;
      if (addr.existing_address_id) {
        const dbAddress = await prisma.address.findUnique({
          where: { id: addr.existing_address_id },
          select: { estimated_value: true },
        });
        return dbAddress?.estimated_value !== null && dbAddress?.estimated_value !== undefined
          ? Number(dbAddress.estimated_value)
          : null;
      }
      return addr.estimated_value !== undefined ? Number(addr.estimated_value) : null;
    }
    const addressValue = className === "Property" ? await resolveRiskAddressValue(risk_address) : null;

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { agent_id: true },
    });
    if (!user?.agent_id) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }
    const agent = await prisma.agent.findUnique({ where: { id: user.agent_id } });

    // The Client Policies page's "Renew This Policy" action carries the
    // source Policy's id along in the create payload — an explicit choice by
    // the agent, checked here rather than in createApplicationSchema since
    // ownership and the "can't start before the current policy expires" rule
    // are business logic, not something a static schema can express. When
    // omitted, the vehicle/risk-address history check below (which runs
    // regardless — see resolveVehicleRenewal/resolveRiskAddressRenewal)
    // auto-derives the same thing: an application is never allowed through
    // when the asset it names already has a still-active or still-pending
    // claim on it, whether or not the agent explicitly asked to renew.
    let policyType = "NEW_POLICY";
    let finalRenewedPolicyId = null;
    if (renewed_policy_id) {
      const renewedPolicy = await prisma.policy.findUnique({
        where: { id: renewed_policy_id },
        select: { id: true, agent_id: true, expiry_date: true },
      });
      if (!renewedPolicy) {
        return res.status(400).json({ error: "renewed_policy_id does not match an existing policy" });
      }
      if (renewedPolicy.agent_id !== agent.id) {
        return res.status(403).json({ error: "That policy isn't on file for your agent account" });
      }
      if (new Date(startAt) < renewedPolicy.expiry_date) {
        return res.status(400).json({ error: "Coverage cannot start before the current policy's expiry date" });
      }
      policyType = "RENEWAL";
      finalRenewedPolicyId = renewed_policy_id;
    }

    // The agent can only file applications for their own connected customers/companies.
    if (insured_type === "INDIVIDUAL") {
      const link = await prisma.customerAgent.findUnique({
        where: { customer_id_agent_id: { customer_id, agent_id: agent.id } },
      });
      if (!link) {
        return res.status(403).json({ error: "This customer isn't connected to your agent account" });
      }
    } else {
      // Also allows a company connected via this agent's own parent agency
      // (Agent.company_id -> Agent.linked_company_id) — see
      // getAccessibleAgentIds()'s own comment and routes/agents.js's POST /.
      const accessibleAgentIds = await getAccessibleAgentIds(agent.id);
      const link = await prisma.companyAgent.findFirst({
        where: { company_id, agent_id: { in: accessibleAgentIds } },
      });
      if (!link) {
        return res.status(403).json({ error: "This company isn't connected to your agent account" });
      }
    }

    // Every coverage resolves against whichever pricing this agent actually
    // has for it, and against the application's own coverage period — see
    // lib/coveragePricing.js (shared with quotation creation, which prices
    // identically).
    const resolvedRows = await resolveCoverageRows({
      coverages,
      className,
      vehicles,
      vehicleValues,
      addressValue,
      agentId: user.agent_id,
      startAt,
      endAt,
    });

    // Statutory charges are computed off the full sum of every coverage's
    // (server-resolved) premium regardless of is_misc — that flag only moves
    // where a coverage's own premium is *displayed* (Premium vs.
    // Miscellaneous), never what it's taxed against. total_premium itself
    // (the "Premium" line) only ever sums the non-is_misc rows; every
    // is_misc-flagged coverage's premium is added to misc instead, on top of
    // the chosen product_variant's own flat fee (ProductVariant.misc_fee).
    // The grand total is computable from these components
    // (total_premium + doc_stamps + vat + lgt + misc) wherever it's needed,
    // so it's never stored.
    const grossPremium = round2(resolvedRows.reduce((sum, r) => sum + r.premium_amount, 0));
    const totalPremium = round2(resolvedRows.filter((r) => !r.is_misc).reduce((sum, r) => sum + r.premium_amount, 0));
    const miscFromCoverages = round2(grossPremium - totalPremium);
    const docStamps = round2(grossPremium * DOC_STAMPS_RATE);
    const vat = round2(grossPremium * VAT_RATE);
    const lgt = round2(grossPremium * LGT_RATE);
    const miscAmount = round2((Number(productVariant.misc_fee) || 0) + miscFromCoverages);

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
        if (!v.existing_vehicle_id) {
          // A vehicle entered as brand new must actually BE new — a plate
          // number is meant to uniquely identify one real vehicle, and
          // Vehicle.plate_number carries no DB-level uniqueness (unlike
          // mv_file_no/engine_number/chassis_number), so without this check
          // an agent could sidestep the plate-lookup/reassignment flow
          // entirely just by not selecting the match, creating a second
          // Vehicle row for a plate that's already on file and defeating the
          // vehicle-history check below (which is keyed on vehicle_id).
          if (v.plate_number) {
            const duplicate = await prisma.vehicle.findFirst({
              where: { plate_number: { equals: v.plate_number, mode: "insensitive" } },
              select: { id: true },
            });
            if (duplicate) {
              return res.status(409).json({
                error: `Plate number ${v.plate_number} is already on file for another vehicle — look it up and reuse or reassign it instead of entering it as new`,
              });
            }
          }
          continue;
        }

        if (v.reassign_owner) {
          // Confirmed by the agent as belonging to (or about to belong to) this
          // party — who currently owns it doesn't matter, that's what's changing.
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

      // A vehicle carries its own fixed Motor product variant (see
      // Vehicle.product_variant_id) — every vehicle on one filing has to
      // resolve to the same variant as the filing's own product_variant_id,
      // never a free per-line choice. For a reused vehicle this is whatever
      // is already on file (only PATCH /vehicles/:id can actually change
      // it); for a brand-new one it's whatever the agent picked for it.
      for (const v of vehicles) {
        const vehicleVariantId = v.existing_vehicle_id
          ? (
              await prisma.vehicle.findUnique({
                where: { id: v.existing_vehicle_id },
                select: { product_variant_id: true },
              })
            )?.product_variant_id
          : v.product_variant_id;
        if (vehicleVariantId !== product_variant_id) {
          return res.status(400).json({
            error: "All vehicles on this application must be insured under the same product variant",
          });
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

    // The actual "no double-insuring the same asset" enforcement — runs
    // regardless of whether the agent went through the manual "Renew This
    // Policy" flow above, closing the gap where a fresh filing (plate
    // lookup found a match, or an agent just typed in an already-known
    // vehicle) would otherwise never be checked at all. A brand-new vehicle
    // has no existing_vehicle_id yet, so only already-on-file ones can have
    // history to check; same for a brand-new risk address. Throws (409) via
    // sendIfHttpError below on an unresolved conflict; otherwise resolves
    // which single policy (if any) this counts as continuing.
    if (className === "Motor") {
      const vehicleIdsForHistory = vehicles.filter((v) => v.existing_vehicle_id).map((v) => v.existing_vehicle_id);
      const { renewedPolicyId: autoRenewedPolicyId } = await resolveVehicleRenewal(vehicleIdsForHistory, startAt, endAt);
      if (!finalRenewedPolicyId && autoRenewedPolicyId) {
        finalRenewedPolicyId = autoRenewedPolicyId;
        policyType = "RENEWAL";
      }
    }
    if (requiresRiskAddress && risk_address.existing_address_id) {
      const { renewedPolicyId: autoRenewedPolicyId } = await resolveRiskAddressRenewal(risk_address.existing_address_id, startAt, endAt);
      if (!finalRenewedPolicyId && autoRenewedPolicyId) {
        finalRenewedPolicyId = autoRenewedPolicyId;
        policyType = "RENEWAL";
      }
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
          send_policy_to_email: Boolean(send_policy_to_email),
          send_policy_to_email_on_approval: Boolean(send_policy_to_email_on_approval),
          payment_method,
          payment_remittance,
          bethel_payment_method_id: bethelPaymentMethod ? bethelPaymentMethod.id : null,
          remarks: remarks || null,
          policy_type: policyType,
          renewed_policy_id: finalRenewedPolicyId,
        },
      });

      // Vehicles have to be resolved to real PolicyApplicationVehicle join
      // rows before the coverage rows below can reference one — a brand-new
      // vehicle doesn't have one until it's actually created here, in the
      // same order as `vehicles`, so a coverage's vehicle_index can be mapped
      // straight onto this array.
      const policyApplicationVehicleIds = [];

      if (className === "Motor") {
        for (const v of vehicles) {
          let vehicleId = null;

          if (v.existing_vehicle_id) {
            vehicleId = v.existing_vehicle_id;

            if (v.reassign_owner) {
              // The agent may have corrected/updated details while confirming
              // the match — persist those before moving ownership over.
              // initial_assessment_date is stamped only the first time a value
              // is recorded, and never moved again afterward — and once
              // assessed, the value itself is frozen too (it only ever
              // changes through automatic depreciation from here on).
              const currentVehicle = await tx.vehicle.findUnique({
                where: { id: vehicleId },
                select: { estimated_value: true, initial_assessment_date: true },
              });
              const alreadyAssessed = Boolean(currentVehicle?.initial_assessment_date);
              await tx.vehicle.update({
                where: { id: vehicleId },
                data: {
                  // plate_number is deliberately NOT included — it's the
                  // vehicle's fixed real-world identifier and must stay
                  // whatever it already is on file, even across a
                  // reassignment to a new owner/agent. A genuine plate-number
                  // correction only ever happens through the dedicated Edit
                  // Vehicle action (PATCH /vehicles/:id), which re-checks
                  // uniqueness when it changes — see that route.
                  mv_file_no: v.mv_file_no,
                  engine_number: v.engine_number,
                  chassis_number: v.chassis_number,
                  make: v.make || null,
                  model: v.model || null,
                  year_model: v.year_model ?? null,
                  vehicle_type: v.vehicle_type || null,
                  color: v.color || null,
                  no_of_seats: v.no_of_seats,
                  estimated_value: alreadyAssessed ? currentVehicle.estimated_value : (v.estimated_value ?? null),
                  initial_assessment_date: alreadyAssessed
                    ? currentVehicle.initial_assessment_date
                    : v.estimated_value !== undefined
                      ? new Date()
                      : null,
                },
              });

              // Treated as sold: close out whichever active ownership link it
              // had (kept for history, not deleted), then open a new one for
              // this application's party.
              await tx.partyVehicle.updateMany({
                where: { vehicle_id: vehicleId, ownership_end_date: null },
                data: { ownership_end_date: new Date() },
              });

              await tx.partyVehicle.create({
                data: { ...partyIdFields, vehicle_id: vehicleId, ownership_start_date: new Date() },
              });
            }
            // else: already verified as on-file for this customer/company above — just reuse it as-is.
          } else {
            const createdVehicle = await tx.vehicle.create({
              data: {
                plate_number: v.plate_number,
                mv_file_no: v.mv_file_no,
                engine_number: v.engine_number,
                chassis_number: v.chassis_number,
                product_variant_id: v.product_variant_id,
                make: v.make || null,
                model: v.model || null,
                year_model: v.year_model ?? null,
                vehicle_type: v.vehicle_type || null,
                color: v.color || null,
                no_of_seats: v.no_of_seats,
                estimated_value: v.estimated_value ?? null,
                initial_assessment_date: v.estimated_value !== undefined ? new Date() : null,
              },
            });
            vehicleId = createdVehicle.id;

            await tx.partyVehicle.create({
              data: { ...partyIdFields, vehicle_id: vehicleId, ownership_start_date: new Date() },
            });
          }

          const policyApplicationVehicle = await tx.policyApplicationVehicle.create({
            data: { policy_application_id: application.id, vehicle_id: vehicleId },
          });
          policyApplicationVehicleIds.push(policyApplicationVehicle.id);
        }
      }

      await tx.applicationCoverage.createMany({
        data: resolvedRows.map((r) => ({
          application_id: application.id,
          coverage_id: r.coverage_id,
          policy_application_vehicle_id: r.vehicle_index !== null ? policyApplicationVehicleIds[r.vehicle_index] : null,
          coverage_amount: r.coverage_amount,
          premium_amount: r.premium_amount,
          payable_to_bethel: r.payable_to_bethel,
          applied_rate: r.applied_rate,
        })),
      });

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
            estimated_value: addr.estimated_value ?? null,
          },
        });

        // New addresses created inline get linked to the party too, same as a
        // new vehicle does, so they're available to pick from next time.
        await tx.partyAddress.create({ data: { ...partyIdFields, address_id: createdAddress.id } });
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

    // Sent right away, not just on manual "Resend to client" — a mail
    // failure here must never fail the application that was just created, so
    // it's caught and logged rather than surfaced (same swallow-and-log
    // pattern as auth.js's forgot-password and users.js's invite email).
    if (result.send_policy_to_email) {
      try {
        const fullApplication = await prisma.policyApplication.findUnique({
          where: { id: result.id },
          select: applicationDetailSelect,
        });
        const detail = toApplicationDetail(fullApplication);
        if (detail.insured_email) {
          const pdfBuffer = await buildPolicyApplicationPdf(toPreviewProps(detail));
          const { subject, html, text } = buildSubmissionEmailContent(detail);
          await sendMail({
            to: detail.insured_email,
            subject,
            html,
            text,
            attachments: [{ filename: `${detail.application_number}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
          });
        }
      } catch (mailErr) {
        console.error("[policyApplications] failed to send submission email", mailErr);
      }
    }

    res.status(201).json(result);
  } catch (err) {
    if (sendIfHttpError(err, res)) return;
    next(err);
  }
});

// Renders a PDF from live, not-yet-saved preview data —
// PolicyApplication's "Print / Save as PDF" button before the application is
// actually submitted. Read-only: nothing here touches the database.
router.post("/preview-pdf", validateBody(documentPreviewPropsSchema), async (req, res, next) => {
  try {
    const pdfBuffer = await buildPolicyApplicationPdf(req.body);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="policy-application-preview.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// Shared select for the routes below that need a single application's full
// detail (the Policy Applications tracker's row detail popup, the resend
// email route, and the saved-PDF download) — same shape/pattern as
// policyQuotations.js's quotationDetailSelect.
const applicationDetailSelect = {
  id: true,
  application_number: true,
  insured_type: true,
  status: true,
  policy_type: true,
  renewed_policy_id: true,
  // Own policy_number of whatever this application renews/replaces — feeds
  // the "Renewing/Replacing:" line on the application PDF (see
  // pdf/policyApplicationPdf.js).
  renewed_policy: { select: { policy_number: true } },
  application_date: true,
  submission_date: true,
  coverage_start_at: true,
  coverage_end_at: true,
  total_premium: true,
  doc_stamps: true,
  vat: true,
  lgt: true,
  misc: true,
  send_policy_to_email: true,
  payment_method: true,
  payment_remittance: true,
  remarks: true,
  created_at: true,
  customer: { select: { first_name: true, last_name: true, middle_name: true, email: true } },
  company_name_snapshot: true,
  company: { select: { email: true } },
  agent: { select: { agent_code: true, agent_name: true } },
  product_variant_id: true,
  product_variant: {
    select: {
      variant_name: true,
      insurance_class: { select: { class_name: true } },
      deductible_rate: true,
    },
  },
  vehicles: {
    orderBy: { created_at: "asc" },
    select: {
      // The join row's own id — not just the Vehicle it points at — so a
      // caller (routes/policyApproval.js's change form) can address "this
      // application's 2nd vehicle" without it possibly resolving to a
      // different application's row for the same underlying Vehicle.
      id: true,
      vehicle: {
        select: {
          plate_number: true,
          mv_file_no: true,
          engine_number: true,
          chassis_number: true,
          make: true,
          model: true,
          year_model: true,
          vehicle_type: true,
          color: true,
          no_of_seats: true,
        },
      },
    },
  },
  addresses: {
    select: {
      role: true,
      address: {
        select: {
          address_line_1: true,
          address_line_2: true,
          barangay: true,
          city: true,
          province: true,
          postal_code: true,
          country: true,
        },
      },
    },
  },
  coverages: {
    select: {
      // Same reasoning as vehicles.id above — routes/policyApproval.js's
      // AddClause/RemoveClause changes need to address one specific coverage
      // line on this application.
      id: true,
      coverage_amount: true,
      premium_amount: true,
      coverage: { select: { coverage_name: true, clause: true, pricing_mode: true } },
    },
  },
};

// Combines a Customer's name columns into the one display/snapshot string
// used everywhere an individual insured's name is shown (insured_name,
// change_from/change_to on an INSURED_NAME_DETAILS change, and eventually
// Policy.customer_name_snapshot) — "Last, First Middle", middle name omitted
// when blank. Attached onto `router` (see bottom of file) so
// routes/policyApproval.js's change-recording and approve handlers build the
// exact same string rather than each re-deriving their own join and
// silently dropping middle_name the way the pre-fix version of this file did.
function formatInsuredName({ last_name, first_name, middle_name }) {
  const given = [first_name, middle_name].filter(Boolean).join(" ");
  return [last_name, given].filter(Boolean).join(", ") || null;
}

// Combines an Address's columns into the one display/snapshot string used
// for insured_address and for an INSURED_ADDRESS_DETAILS change's
// change_from/change_to — every field a caller can actually edit via that
// change type (see updateAddressSchema/policyApplicationChanges.js), not
// just address_line_1.
function formatAddress(address) {
  if (!address) return null;
  return (
    [
      address.address_line_1,
      address.address_line_2,
      address.barangay,
      address.city,
      address.province,
      address.postal_code,
      address.country,
    ]
      .filter(Boolean)
      .join(", ") || null
  );
}

// Turns the raw Prisma record into the flat shape the Policy Applications
// tracker's detail popup and the resend email both render from — mirrors
// policyQuotations.js's toQuotationDetail().
function toApplicationDetail(application) {
  const insuredAddress = application.addresses.find((a) => a.role === "INSURED")?.address;
  const totalAmount =
    Number(application.total_premium) +
    Number(application.doc_stamps) +
    Number(application.vat) +
    Number(application.lgt) +
    Number(application.misc);

  return {
    id: application.id,
    application_number: application.application_number,
    insured_type: application.insured_type,
    insured_name:
      application.insured_type === "INDIVIDUAL" ? formatInsuredName(application.customer || {}) : application.company_name_snapshot,
    // Split-out name columns — not rendered anywhere themselves, just so
    // routes/policyApproval.js's "Create Change" form can prefill separate
    // First/Middle/Last inputs instead of asking an approver to retype
    // insured_name's whole "Last, First Middle" string from scratch. null
    // for a CORPORATE application (insured_name/company_name_snapshot is
    // already the single field there).
    insured_first_name: application.insured_type === "INDIVIDUAL" ? application.customer?.first_name ?? null : null,
    insured_middle_name: application.insured_type === "INDIVIDUAL" ? application.customer?.middle_name ?? null : null,
    insured_last_name: application.insured_type === "INDIVIDUAL" ? application.customer?.last_name ?? null : null,
    insured_email: application.insured_type === "INDIVIDUAL" ? application.customer?.email : application.company?.email,
    insured_address: formatAddress(insuredAddress),
    // Same reasoning as the split name columns above — lets the change form
    // prefill every individually-editable address field, not just line 1.
    insured_address_line_1: insuredAddress?.address_line_1 ?? null,
    insured_address_line_2: insuredAddress?.address_line_2 ?? null,
    insured_barangay: insuredAddress?.barangay ?? null,
    insured_city: insuredAddress?.city ?? null,
    insured_province: insuredAddress?.province ?? null,
    insured_postal_code: insuredAddress?.postal_code ?? null,
    insured_country: insuredAddress?.country ?? null,
    class_name: application.product_variant.insurance_class.class_name,
    product_variant_id: application.product_variant_id,
    variant_name: application.product_variant.variant_name,
    deductible_rate: application.product_variant.deductible_rate,
    agent_code: application.agent.agent_code,
    agent_name: application.agent.agent_name,
    status: application.status,
    policy_type: application.policy_type,
    renewed_policy_id: application.renewed_policy_id,
    renewed_policy_number: application.renewed_policy?.policy_number || null,
    application_date: application.application_date,
    submission_date: application.submission_date,
    coverage_start_at: application.coverage_start_at,
    coverage_end_at: application.coverage_end_at,
    send_policy_to_email: application.send_policy_to_email,
    payment_method: application.payment_method,
    payment_remittance: application.payment_remittance,
    total_premium: application.total_premium,
    doc_stamps: application.doc_stamps,
    vat: application.vat,
    lgt: application.lgt,
    misc: application.misc,
    total_amount: totalAmount,
    remarks: application.remarks,
    created_at: application.created_at,
    vehicles: application.vehicles.map((v) => ({ ...v.vehicle, application_vehicle_id: v.id })),
    coverages: application.coverages.map((c) => ({
      id: c.id,
      name: c.coverage.coverage_name,
      clause: c.coverage.clause,
      amount: c.coverage_amount,
      premium: c.premium_amount,
      pricing_mode: c.coverage.pricing_mode,
    })),
  };
}

// Maps an application's DB-flattened detail onto the same shared prop shape
// every PDFKit builder takes — mirrors policyQuotations.js's toPreviewProps().
// isPreview stays true even for an already-saved application: it isn't an
// issued Policy yet (that only exists once approved — see
// Policy.application_id), so the exported document keeps saying so.
function toPreviewProps(detail) {
  return {
    applicationNumber: detail.application_number,
    isPreview: true,
    classNameLabel: detail.class_name,
    variantName: detail.variant_name,
    insuredName: detail.insured_name,
    insuredAddress: detail.insured_address,
    agentCode: detail.agent_code,
    coverageStartAt: detail.coverage_start_at,
    coverageEndAt: detail.coverage_end_at,
    vehicles: detail.vehicles || [],
    coverages: detail.coverages || [],
    deductibleRate: detail.deductible_rate,
    totalPremium: detail.total_premium,
    docStamps: detail.doc_stamps,
    vat: detail.vat,
    lgt: detail.lgt,
    misc: detail.misc,
    totalAmount: detail.total_amount,
    remarks: detail.remarks,
    renewingPolicyNumber: detail.renewed_policy_number || undefined,
  };
}

// Folds recorded PolicyApplicationChange rows onto an already-built
// toApplicationDetail() result, for the change types that never mutate a
// Vehicle/Address row and so wouldn't otherwise show up in a fresh read —
// VEHICLE_*/INSURED_ADDRESS_DETAILS changes are already live on the
// underlying rows this detail was built from, so they need no overlay here.
// Attached onto `router` (see the bottom of this file) rather than
// duplicated, same as applicationDetailSelect/toApplicationDetail/
// toPreviewProps above — both this router (agent-facing) and
// routes/policyApproval.js (approver-facing) need every recorded correction
// reflected wherever an application's detail/PDF/emailed copy is rendered,
// not just in the approval queue.
function applyChangesToDetail(detail, changes) {
  const next = { ...detail, coverages: detail.coverages.map((c) => ({ ...c })) };
  // The period's length (coverage_end_at - coverage_start_at) is fixed at
  // whatever it was originally quoted/applied for — an INSURED_FROM_DATE
  // change moves the whole period, it doesn't just push the start date out
  // while leaving the end date behind (which would silently shrink or
  // stretch the period). Captured once, before the loop, so two
  // INSURED_FROM_DATE changes in a row (the second superseding the first)
  // both shift from the same original length rather than compounding.
  const originalDurationMs = detail.coverage_end_at.getTime() - detail.coverage_start_at.getTime();
  for (const change of changes) {
    if (change.change_type === "INSURED_FROM_DATE") {
      next.coverage_start_at = new Date(change.change_to);
      next.coverage_end_at = new Date(next.coverage_start_at.getTime() + originalDurationMs);
    } else if (change.change_type === "INSURED_NAME_DETAILS") {
      next.insured_name = change.change_to;
      // Keep the split first/middle/last fields in sync with the corrected
      // combined string too (parsing formatInsuredName's own "Last, First
      // Middle" shape back apart) — otherwise a second "Create Change" on an
      // already-corrected name would prefill its First/Middle/Last inputs
      // from the stale original Customer row instead of the last correction.
      if (next.insured_type === "INDIVIDUAL") {
        const [lastPart, ...rest] = (change.change_to || "").split(",");
        const givenParts = rest.join(",").trim().split(/\s+/).filter(Boolean);
        next.insured_last_name = lastPart?.trim() || null;
        next.insured_first_name = givenParts[0] || null;
        next.insured_middle_name = givenParts.slice(1).join(" ") || null;
      }
    } else if (CLAUSE_CHANGE_TYPES.has(change.change_type) && change.application_coverage_id) {
      const idx = next.coverages.findIndex((c) => c.id === change.application_coverage_id);
      if (idx !== -1) next.coverages[idx] = { ...next.coverages[idx], clause: change.change_to };
    }
  }
  return next;
}

// One application's full detail — powers the Policy Applications tracker's
// row detail popup. Scoped to the caller's own agent, same as the list route.
// Any recorded PolicyApplicationChange rows are folded in (applyChangesToDetail
// above) so an agent always sees the corrected picture, same as an approver
// reviewing the same application does.
router.get("/:id", validateParams(applicationIdParamSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { agent_id: true } });
    if (!user?.agent_id) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const application = await prisma.policyApplication.findFirst({
      where: { id: req.params.id, agent_id: user.agent_id },
      select: applicationDetailSelect,
    });
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    const changes = await prisma.policyApplicationChange.findMany({
      where: { policy_application_id: req.params.id },
      orderBy: { created_at: "asc" },
    });

    res.json(applyChangesToDetail(toApplicationDetail(application), changes));
  } catch (err) {
    next(err);
  }
});

// Every recorded change for one application, oldest first — the Policy
// Applications tracker detail popup's change-history list. Scoped to the
// caller's own agent, same as GET /:id above; mirrors
// GET /policy-approval/:id/changes exactly (same response shape), just with
// that extra ownership check since this is the agent-facing route.
router.get("/:id/changes", validateParams(applicationIdParamSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { agent_id: true } });
    if (!user?.agent_id) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const application = await prisma.policyApplication.findFirst({
      where: { id: req.params.id, agent_id: user.agent_id },
      select: { id: true },
    });
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    const changes = await prisma.policyApplicationChange.findMany({
      where: { policy_application_id: req.params.id },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        change_type: true,
        change_from: true,
        change_to: true,
        effective_date: true,
        remarks: true,
        created_at: true,
        application_vehicle_id: true,
        application_coverage_id: true,
        created_by: { select: { full_name: true, email: true } },
      },
    });

    res.json(
      changes.map((c) => ({
        id: c.id,
        change_type: c.change_type,
        change_from: c.change_from,
        change_to: c.change_to,
        effective_date: c.effective_date,
        remarks: c.remarks,
        created_at: c.created_at,
        application_vehicle_id: c.application_vehicle_id,
        application_coverage_id: c.application_coverage_id,
        created_by_name: c.created_by.full_name || c.created_by.email,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// PDF download for an already-saved application — the Policy Applications
// tracker detail popup's "Re-export PDF" action. Any recorded changes are
// folded in first (applyChangesToDetail above) so the exported PDF always
// reflects the latest corrections, same as routes/policyApproval.js's own
// GET /:id/pdf.
router.get("/:id/pdf", validateParams(applicationIdParamSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { agent_id: true } });
    if (!user?.agent_id) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const application = await prisma.policyApplication.findFirst({
      where: { id: req.params.id, agent_id: user.agent_id },
      select: applicationDetailSelect,
    });
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    const changes = await prisma.policyApplicationChange.findMany({
      where: { policy_application_id: req.params.id },
      orderBy: { created_at: "asc" },
    });

    const detail = applyChangesToDetail(toApplicationDetail(application), changes);
    const pdfBuffer = await buildPolicyApplicationPdf(toPreviewProps(detail));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${detail.application_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// Re-sends the application's policy schedule to whatever email is on file
// for the insured customer/company — the Policy Applications tracker detail
// popup's "Resend to client" action. Mirrors policyQuotations.js's
// resend-email route. Any recorded changes are folded in first
// (applyChangesToDetail above), so a resend after a correction has been
// logged actually reflects it, instead of re-sending the original filing.
router.post("/:id/resend-email", validateParams(applicationIdParamSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { agent_id: true } });
    if (!user?.agent_id) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const application = await prisma.policyApplication.findFirst({
      where: { id: req.params.id, agent_id: user.agent_id },
      select: applicationDetailSelect,
    });
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    const changes = await prisma.policyApplicationChange.findMany({
      where: { policy_application_id: req.params.id },
      orderBy: { created_at: "asc" },
    });

    const detail = applyChangesToDetail(toApplicationDetail(application), changes);
    if (!detail.insured_email) {
      return res.status(400).json({ error: "This customer/company has no email address on file" });
    }

    const html = `
      <div style="font-family:Arial,sans-serif;color:#111">
        <p>Dear ${detail.insured_name},</p>
        <p>Please find your policy application from Bethel General Insurance and Surety Corp. attached as a PDF (Application No. ${detail.application_number}).</p>
        <p>This application is not yet an issued policy. Please contact your agent (${detail.agent_name || detail.agent_code}) with any questions.</p>
      </div>
    `;
    const text = [
      `Dear ${detail.insured_name},`,
      "",
      `Please find your policy application from Bethel General Insurance and Surety Corp. attached as a PDF (Application No. ${detail.application_number}).`,
      "",
      `This application is not yet an issued policy. Please contact your agent (${detail.agent_name || detail.agent_code}) with any questions.`,
    ].join("\n");

    const pdfBuffer = await buildPolicyApplicationPdf(toPreviewProps(detail));

    await sendMail({
      to: detail.insured_email,
      subject: `Your Bethel Insurance Policy Application ${detail.application_number}`,
      html,
      text,
      attachments: [
        {
          filename: `${detail.application_number}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    res.json({ sent: true, to: detail.insured_email });
  } catch (err) {
    if (sendIfHttpError(err, res)) return;
    next(err);
  }
});

// Attached to the router function (Express routers are just functions, so
// this is safe) rather than duplicated — routes/policyApproval.js needs the
// exact same detail shape/mapping for its own (non-agent-scoped) detail and
// PDF routes, and this isn't a "layout" the way the PDF builders are, so
// there's no reason to keep two copies in sync by hand.
router.applicationDetailSelect = applicationDetailSelect;
router.toApplicationDetail = toApplicationDetail;
router.toPreviewProps = toPreviewProps;
router.applyChangesToDetail = applyChangesToDetail;
router.formatInsuredName = formatInsuredName;
router.formatAddress = formatAddress;

module.exports = router;
