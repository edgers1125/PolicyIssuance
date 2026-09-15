const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, ensurePermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody, validateQuery, validateParams } = require("../middleware/validate");
const {
  createQuotationSchema,
  updateQuotationSchema,
  submitQuotationSchema,
  listQuotationsQuerySchema,
  quotationIdParamSchema,
} = require("../schemas/policyQuotations");
const { documentPreviewPropsSchema } = require("../schemas/policyIntakeShared");
const { currentVehicleValue } = require("../lib/vehicleValue");
const { round2, resolveCoverageRows } = require("../lib/coveragePricing");
const { assertVehiclesFree, assertRiskAddressFree } = require("../lib/policyConflicts");
const { sendIfHttpError } = require("../lib/httpError");
const { sendMail } = require("../lib/mailer");
const { buildSubmissionEmailContent } = require("../lib/applicationEmails");
const { buildQuotationPdf } = require("../pdf/quotationPdf");
const { buildPolicyApplicationPdf } = require("../pdf/policyApplicationPdf");
const {
  applicationDetailSelect,
  toApplicationDetail,
  toPreviewProps: toApplicationPreviewProps,
} = require("./policyApplications");

const router = express.Router();

// QUOTATION_TRACKER is page access only (browsing the catalog and your
// customers/companies, same as landing on the page at all) — every actual
// action below needs its own more specific grant: VIEW_QUOTATION/
// ADMIN_VIEW_QUOTATION to read, CREATE_QUOTATION/ADMIN_CREATE_QUOTATION to
// write. See the four permission codes and resolveScope/resolveWriteAgent
// below.
router.use(requireAuth, requirePermission("QUOTATION_TRACKER"));

// Base tier always scopes to the caller's own linked agent; the ADMIN_*
// tier lifts that to every agent (view) or lets a specific one be chosen
// (create/edit) — see resolveScope/resolveWriteAgent below.
const VIEW_CODE = "QUOTATION_TRACKER.VIEW_QUOTATION";
const ADMIN_VIEW_CODE = "QUOTATION_TRACKER.ADMIN_VIEW_QUOTATION";
const CREATE_CODE = "QUOTATION_TRACKER.CREATE_QUOTATION";
const ADMIN_CREATE_CODE = "QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION";

// ensurePermission (middleware/permissions.js) only checks one code — this
// covers the "base tier OR admin tier" shape almost every route below needs.
function ensureAnyPermission(res, actingPermissions, codes) {
  if (codes.some((c) => actingPermissions.has(c))) return true;
  res.status(403).json({ error: `Missing required permission: one of ${codes.join(", ")}` });
  return false;
}

// Resolves the agent_id scope for an action against quotations in general
// (list) or one already-existing quotation (detail/edit/pdf/resend/submit):
// null means "every agent" (the caller holds adminCode), otherwise the
// caller's own linked agent (holds baseCode). Writes the error response
// itself and returns null on any failure (missing both permissions, or no
// agent link) — the caller must `return` immediately in that case.
// actingPermissions can be passed in when a caller already fetched it (e.g.
// POST /:id/submit, which also needs CREATE_APPLICATION.AGENT_ISSUANCE) to
// avoid a redundant lookup.
async function resolveScope(req, res, baseCode, adminCode, actingPermissions) {
  const permissions = actingPermissions || (await getUserPermissionCodes(req.user.userId));
  if (permissions.has(adminCode)) return { agentId: null };
  if (!ensureAnyPermission(res, permissions, [baseCode, adminCode])) return null;
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { agent_id: true } });
  if (!user?.agent_id) {
    res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    return null;
  }
  return { agentId: user.agent_id };
}

// Resolves the Agent a POST / (create) should file the new quotation under —
// req.body.agent_id, but only once the caller actually holds
// ADMIN_CREATE_QUOTATION (403 otherwise); falls back to the caller's own
// linked agent when omitted, same as every other route in this app. Writes
// the error response itself and returns null on any failure — the caller
// must `return` immediately. Assumes the caller already confirmed
// CREATE_CODE or ADMIN_CREATE_CODE is held (see ensureAnyPermission above) —
// this only decides *whose* agent, not whether creating is allowed at all.
async function resolveWriteAgent(req, res, actingPermissions) {
  const requestedAgentId = req.body?.agent_id;
  if (requestedAgentId) {
    if (!ensurePermission(res, actingPermissions, ADMIN_CREATE_CODE)) return null;
    const agent = await prisma.agent.findUnique({ where: { id: requestedAgentId } });
    if (!agent) {
      res.status(400).json({ error: "agent_id does not match an existing agent" });
      return null;
    }
    return agent;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { agent_id: true } });
  if (!user?.agent_id) {
    res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    return null;
  }
  return prisma.agent.findUnique({ where: { id: user.agent_id } });
}

const DOC_STAMPS_RATE = 0.125;
const VAT_RATE = 0.12;
const LGT_RATE = 0.002;

function generateQuotationNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `QUO-${datePart}-${randomPart}`;
}

// Same format as policyApplications.js's own generator — kept as its own
// tiny local copy rather than a cross-file import, same reasoning as the PDF
// builders in src/pdf/ being deliberately duplicated instead of shared.
function generateApplicationNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `APP-${datePart}-${randomPart}`;
}

// Every active agent, for the New Quotation form's "File under agent" picker
// — only shown at all once ADMIN_CREATE_QUOTATION is held, so that's this
// route's whole gate (QUOTATION_TRACKER, the router-level grant, is already
// required to get this far). Deliberately its own minimal route here rather
// than reusing GET /agents (routes/agents.js), which needs MANAGE_AGENTS —
// a different, unrelated permission an admin quotation-creator may not hold
// — and returns premium/rate data this picker has no business seeing anyway.
router.get("/agents", requirePermission(ADMIN_CREATE_CODE), async (req, res, next) => {
  try {
    const agents = await prisma.agent.findMany({
      where: { status: "ACTIVE" },
      orderBy: { agent_name: "asc" },
      select: { id: true, agent_code: true, agent_name: true },
    });
    res.json(agents);
  } catch (err) {
    next(err);
  }
});

// Every quotation the caller can see, latest first — the Quotation Tracker's
// list view. Scoped to the caller's own agent (VIEW_QUOTATION) unless they
// hold ADMIN_VIEW_QUOTATION, in which case every agent's quotations are
// included and each row carries agent_code/agent_name (unused when scoped to
// one agent, but harmless to always include) so the tracker can show an
// Agent column, same as GET /policy-approval does for applications.
router.get("/", validateQuery(listQuotationsQuerySchema), async (req, res, next) => {
  try {
    const scope = await resolveScope(req, res, VIEW_CODE, ADMIN_VIEW_CODE);
    if (!scope) return;

    const { page, page_size: pageSize } = req.query;
    const where = scope.agentId ? { agent_id: scope.agentId } : {};

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
          // Presence alone is enough to know whether this quotation has
          // already been converted — used to disable Edit/Submit in the
          // tracker's Actions column once it has, and to resolve the
          // "For Issuance" status/link below (application_number is what the
          // tracker links out to on the Policy Applications page).
          converted_application: { select: { id: true, application_number: true } },
          agent: { select: { agent_code: true, agent_name: true } },
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
        converted: Boolean(q.converted_application),
        // Status is never stored — it's entirely derived from whether this
        // quotation has a converted_application, the same way `converted`
        // already was. FOR_ISSUANCE carries the resulting application's id/
        // number so the tracker can render a clickable link straight to it.
        status: q.converted_application ? "FOR_ISSUANCE" : "SUBMITTED",
        converted_application_id: q.converted_application?.id || null,
        converted_application_number: q.converted_application?.application_number || null,
        agent_code: q.agent.agent_code,
        agent_name: q.agent.agent_name,
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
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensureAnyPermission(res, actingPermissions, [CREATE_CODE, ADMIN_CREATE_CODE])) return;
    const agent = await resolveWriteAgent(req, res, actingPermissions);
    if (!agent) return;

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

    // Same "risk address value stands in for a vehicle's" pattern as
    // policyApplications.js — see lib/coveragePricing.js.
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

    // Same connected-party restriction as an application — a quotation can
    // only be filed for a customer/company connected to the agent it's
    // filed under (see resolveWriteAgent above — agent.id is the caller's
    // own agent, or whichever one ADMIN_CREATE_QUOTATION let them choose).
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
      addressValue,
      agentId: agent.id,
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
                  no_of_seats: v.no_of_seats,
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
            estimated_value: addr.estimated_value ?? null,
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

// Shared select for the two routes below that need a single quotation's full
// detail (the Quotation Tracker's detail popup, and the resend-email route
// which needs the same insured/coverage data to render the email body).
const quotationDetailSelect = {
  id: true,
  quotation_number: true,
  insured_type: true,
  quotation_date: true,
  coverage_start_at: true,
  coverage_end_at: true,
  total_premium: true,
  doc_stamps: true,
  vat: true,
  lgt: true,
  misc: true,
  send_policy_to_email: true,
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
      authorized_repair_limit_rate: true,
    },
  },
  // Ordered so a coverage's vehicle_indices (positions into this array) mean
  // the same thing every time it's read — the edit route resolves incoming
  // vehicle_indices against this exact same order.
  vehicles: {
    orderBy: { created_at: "asc" },
    select: {
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
          // Needed client-side only to mirror VALUE_PERCENTAGE pricing (the
          // same non-authoritative preview QuotationCreator.jsx already
          // does) while editing — the server always recomputes for real.
          estimated_value: true,
          initial_assessment_date: true,
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
          // Needed client-side only to mirror VALUE_PERCENTAGE pricing for a
          // Property risk address (the same non-authoritative preview
          // QuotationCreator.jsx already does for a vehicle's value) while
          // editing — the server always recomputes for real.
          estimated_value: true,
        },
      },
    },
  },
  coverages: {
    select: {
      coverage_id: true,
      policy_quotation_vehicle_id: true,
      coverage_amount: true,
      premium_amount: true,
      coverage: { select: { coverage_name: true, clause: true, pricing_mode: true } },
    },
  },
  // Presence alone tells the Quotation Tracker whether this quotation can
  // still be edited/submitted — see toQuotationDetail's `converted` field.
  converted_application: { select: { id: true, application_number: true } },
};

// Turns the raw Prisma record (relations and all) into the flat shape the
// Quotation Tracker's detail popup and the resend email both render from.
function toQuotationDetail(quotation) {
  const insuredAddress = quotation.addresses.find((a) => a.role === "INSURED")?.address;
  const riskAddress = quotation.addresses.find((a) => a.role === "RISK")?.address;
  const totalAmount =
    Number(quotation.total_premium) + Number(quotation.doc_stamps) + Number(quotation.vat) + Number(quotation.lgt) + Number(quotation.misc);
  // Position of each PolicyQuotationVehicle join row within the (stably
  // ordered) vehicles array — lets a coverage row's
  // policy_quotation_vehicle_id be reported back as the same vehicle_indices
  // shape the edit form (and createQuotationSchema) already speaks.
  const vehicleIndexByJoinId = new Map(quotation.vehicles.map((v, i) => [v.id, i]));

  return {
    id: quotation.id,
    quotation_number: quotation.quotation_number,
    insured_type: quotation.insured_type,
    insured_name:
      quotation.insured_type === "INDIVIDUAL"
        ? [quotation.customer?.last_name, quotation.customer?.first_name].filter(Boolean).join(", ")
        : quotation.company_name_snapshot,
    insured_email: quotation.insured_type === "INDIVIDUAL" ? quotation.customer?.email : quotation.company?.email,
    insured_address: insuredAddress
      ? [insuredAddress.address_line_1, insuredAddress.barangay, insuredAddress.city, insuredAddress.province]
          .filter(Boolean)
          .join(", ")
      : null,
    // Only meaningful for Property — lets EditQuotationDialog.jsx mirror
    // VALUE_PERCENTAGE pricing client-side (see coverageVehicles' equivalent
    // role for Motor) without needing a second fetch.
    risk_address_value:
      riskAddress?.estimated_value !== null && riskAddress?.estimated_value !== undefined
        ? Number(riskAddress.estimated_value)
        : null,
    class_name: quotation.product_variant.insurance_class.class_name,
    product_variant_id: quotation.product_variant_id,
    variant_name: quotation.product_variant.variant_name,
    deductible_rate: quotation.product_variant.deductible_rate,
    authorized_repair_limit_rate: quotation.product_variant.authorized_repair_limit_rate,
    agent_code: quotation.agent.agent_code,
    agent_name: quotation.agent.agent_name,
    quotation_date: quotation.quotation_date,
    coverage_start_at: quotation.coverage_start_at,
    coverage_end_at: quotation.coverage_end_at,
    send_policy_to_email: quotation.send_policy_to_email,
    total_premium: quotation.total_premium,
    doc_stamps: quotation.doc_stamps,
    vat: quotation.vat,
    lgt: quotation.lgt,
    misc: quotation.misc,
    total_amount: totalAmount,
    remarks: quotation.remarks,
    created_at: quotation.created_at,
    vehicles: quotation.vehicles.map((v) => v.vehicle),
    coverages: quotation.coverages.map((c) => ({
      coverage_id: c.coverage_id,
      vehicle_index: c.policy_quotation_vehicle_id !== null ? vehicleIndexByJoinId.get(c.policy_quotation_vehicle_id) : null,
      name: c.coverage.coverage_name,
      clause: c.coverage.clause,
      amount: c.coverage_amount,
      premium: c.premium_amount,
      pricing_mode: c.coverage.pricing_mode,
    })),
    // Once true, the Quotation Tracker can no longer offer Edit/Submit for
    // this row — it's already become a real policy application.
    converted: Boolean(quotation.converted_application),
    converted_application_number: quotation.converted_application?.application_number || null,
  };
}

// Maps a quotation's DB-flattened detail onto the same prop shape
// frontend/src/components/PolicySchedulePreview.jsx takes — the one shared
// contract every PDFKit builder in src/pdf/ and every live "preview-pdf"
// call consumes, whether the quotation is already saved or still a draft.
function toPreviewProps(detail) {
  return {
    applicationNumber: detail.quotation_number,
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
    authorizedRepairLimitRate: detail.authorized_repair_limit_rate,
    totalPremium: detail.total_premium,
    docStamps: detail.doc_stamps,
    vat: detail.vat,
    lgt: detail.lgt,
    misc: detail.misc,
    totalAmount: detail.total_amount,
    remarks: detail.remarks,
  };
}

// Renders a PDF from live, not-yet-saved preview data — QuotationCreator's
// "Print / Save as PDF" button before the quotation is actually submitted.
// Read-only: nothing here touches the database.
router.post("/preview-pdf", validateBody(documentPreviewPropsSchema), async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensureAnyPermission(res, actingPermissions, [CREATE_CODE, ADMIN_CREATE_CODE])) return;

    const pdfBuffer = await buildQuotationPdf(req.body);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="quotation-preview.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// One quotation's full detail — powers the Quotation Tracker's row detail
// popup. Scoped to the caller's own agent (VIEW_QUOTATION), or every agent
// (ADMIN_VIEW_QUOTATION), same as the list route.
router.get("/:id", validateParams(quotationIdParamSchema), async (req, res, next) => {
  try {
    const scope = await resolveScope(req, res, VIEW_CODE, ADMIN_VIEW_CODE);
    if (!scope) return;

    const where = scope.agentId ? { id: req.params.id, agent_id: scope.agentId } : { id: req.params.id };
    const quotation = await prisma.policyQuotation.findFirst({ where, select: quotationDetailSelect });
    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    res.json(toQuotationDetail(quotation));
  } catch (err) {
    next(err);
  }
});

// Edits a saved quotation's coverage period, delivery-by-email flag, and
// priced coverages — the Quotation Tracker's Actions-column edit action.
// Everything else about the quotation (party, product, vehicles, addresses)
// is fixed at creation; re-pricing here follows the exact same path
// (resolveCoverageRows) POST / does, against the quotation's own
// already-linked vehicles (their order — see quotationDetailSelect — is
// what a coverage's vehicle_indices are positions into).
router.patch("/:id", validateParams(quotationIdParamSchema), validateBody(updateQuotationSchema), async (req, res, next) => {
  try {
    const scope = await resolveScope(req, res, CREATE_CODE, ADMIN_CREATE_CODE);
    if (!scope) return;

    const where = scope.agentId ? { id: req.params.id, agent_id: scope.agentId } : { id: req.params.id };
    const quotation = await prisma.policyQuotation.findFirst({
      where,
      select: {
        id: true,
        // Needed for resolveCoverageRows below — pricing (net rate/tiers)
        // is always the QUOTATION's own agent's, never the caller's (an
        // ADMIN_CREATE_QUOTATION caller editing someone else's quotation
        // must still re-price against that agent's rates, not their own).
        agent_id: true,
        product_variant: { select: { insurance_class: { select: { class_name: true } } } },
        converted_application: { select: { application_number: true } },
        vehicles: {
          orderBy: { created_at: "asc" },
          select: { id: true, vehicle_id: true, vehicle: { select: { estimated_value: true, initial_assessment_date: true } } },
        },
        // Only ever has a RISK row for Property — needed the same way
        // vehicles are, to re-price a VALUE_PERCENTAGE coverage; the risk
        // address itself isn't editable here (fixed at creation), so this is
        // read-only lookup, never written back.
        addresses: {
          where: { role: "RISK" },
          select: { address: { select: { estimated_value: true } } },
        },
      },
    });
    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }
    if (quotation.converted_application) {
      return res
        .status(409)
        .json({ error: `This quotation has already been submitted as policy application ${quotation.converted_application.application_number} and can no longer be edited` });
    }

    const { coverage_start_at: startAt, coverage_end_at: endAt, coverages, send_policy_to_email } = req.body;
    const className = quotation.product_variant.insurance_class.class_name;

    // resolveCoverageRows only needs enough of each vehicle to resolve
    // VALUE_PERCENTAGE pricing (its current depreciated value) — vehicles
    // themselves aren't editable here, so `existing_vehicle_id` is set but
    // never actually used by that path.
    const vehicles = quotation.vehicles.map((v) => ({ existing_vehicle_id: v.vehicle_id }));
    const vehicleValues =
      className === "Motor"
        ? quotation.vehicles.map((v) => currentVehicleValue(v.vehicle.estimated_value, v.vehicle.initial_assessment_date))
        : [];
    const riskAddressValue = quotation.addresses[0]?.address?.estimated_value;
    const addressValue =
      className === "Property" && riskAddressValue !== null && riskAddressValue !== undefined
        ? Number(riskAddressValue)
        : null;

    const resolvedRows = await resolveCoverageRows({
      coverages,
      className,
      vehicles,
      vehicleValues,
      addressValue,
      agentId: quotation.agent_id,
      startAt,
      endAt,
    });

    const totalPremium = round2(resolvedRows.reduce((sum, r) => sum + r.premium_amount, 0));
    const docStamps = round2(totalPremium * DOC_STAMPS_RATE);
    const vat = round2(totalPremium * VAT_RATE);
    const lgt = round2(totalPremium * LGT_RATE);
    const policyQuotationVehicleIds = quotation.vehicles.map((v) => v.id);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.quotationCoverage.deleteMany({ where: { quotation_id: quotation.id } });
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

      return tx.policyQuotation.update({
        where: { id: quotation.id },
        data: {
          coverage_start_at: startAt,
          coverage_end_at: endAt,
          send_policy_to_email: send_policy_to_email !== undefined ? Boolean(send_policy_to_email) : undefined,
          total_premium: totalPremium,
          doc_stamps: docStamps,
          vat,
          lgt,
        },
        select: quotationDetailSelect,
      });
    });

    res.json(toQuotationDetail(updated));
  } catch (err) {
    if (sendIfHttpError(err, res)) return;
    next(err);
  }
});

// Converts a saved quotation into a policy application, carrying over its
// party/vehicles/addresses/coverages exactly as agreed in the quotation
// (never re-priced — what the customer was quoted is what gets applied
// for). What a quotation never collects — payment info, and the two
// delivery flags an application has but a quotation doesn't (whether to
// email that it's under approval, whether to email it once approved) —
// is what submitQuotationSchema supplies fresh here, rather than carrying
// send_policy_to_email over from the quotation's own value: "email the
// client the quotation" and "email the client that their application is
// now under approval" are different decisions. The Quotation Tracker's
// Actions-column submit action.
router.post("/:id/submit", validateParams(quotationIdParamSchema), validateBody(submitQuotationSchema), async (req, res, next) => {
  try {
    // Converting into an application is "issuing" one, same as filing a
    // fresh application — same extra grant required, independent of (and in
    // addition to) the quotation-scope check below.
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensurePermission(res, actingPermissions, "CREATE_APPLICATION.AGENT_ISSUANCE")) return;

    const scope = await resolveScope(req, res, CREATE_CODE, ADMIN_CREATE_CODE, actingPermissions);
    if (!scope) return;

    const where = scope.agentId ? { id: req.params.id, agent_id: scope.agentId } : { id: req.params.id };
    const quotation = await prisma.policyQuotation.findFirst({
      where,
      select: {
        id: true,
        insured_type: true,
        customer_id: true,
        company_id: true,
        company_name_snapshot: true,
        agent_id: true,
        agent_name_snapshot: true,
        product_variant_id: true,
        coverage_start_at: true,
        coverage_end_at: true,
        total_premium: true,
        doc_stamps: true,
        vat: true,
        lgt: true,
        misc: true,
        remarks: true,
        converted_application: { select: { application_number: true } },
        product_variant: { select: { insurance_class: { select: { class_name: true } } } },
        vehicles: { orderBy: { created_at: "asc" }, select: { id: true, vehicle_id: true } },
        addresses: { select: { role: true, address_id: true } },
        coverages: {
          select: {
            coverage_id: true,
            policy_quotation_vehicle_id: true,
            coverage_amount: true,
            premium_amount: true,
            payable_to_bethel: true,
            applied_rate: true,
          },
        },
      },
    });
    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }
    if (quotation.converted_application) {
      return res
        .status(409)
        .json({ error: `This quotation has already been submitted as policy application ${quotation.converted_application.application_number}` });
    }

    const { payment_method, payment_remittance, bethel_payment_method_id, send_policy_to_email, send_policy_to_email_on_approval } = req.body;
    let bethelPaymentMethod = null;
    if (bethel_payment_method_id) {
      bethelPaymentMethod = await prisma.authorizedPaymentMethod.findUnique({ where: { id: bethel_payment_method_id } });
      if (!bethelPaymentMethod) {
        return res.status(400).json({ error: "bethel_payment_method_id does not match an existing payment method" });
      }
    }

    const className = quotation.product_variant.insurance_class.class_name;
    const vehicleIds = quotation.vehicles.map((v) => v.vehicle_id);
    const riskAddress = quotation.addresses.find((a) => a.role === "RISK");

    // The rule the agent asked for: never let the same vehicle, or (for an
    // address-based/Property product) the same risk address, carry an
    // application still pending approval, or an active policy whose own
    // effectivity period overlaps this quotation's coverage period.
    if (className === "Motor") {
      await assertVehiclesFree(vehicleIds, quotation.coverage_start_at, quotation.coverage_end_at);
    }
    if (className === "Property" && riskAddress) {
      await assertRiskAddressFree(riskAddress.address_id, quotation.coverage_start_at, quotation.coverage_end_at);
    }

    const result = await prisma.$transaction(async (tx) => {
      const application = await tx.policyApplication.create({
        data: {
          insured_type: quotation.insured_type,
          application_number: generateApplicationNumber(),
          customer_id: quotation.customer_id,
          company_id: quotation.company_id,
          company_name_snapshot: quotation.company_name_snapshot,
          agent_id: quotation.agent_id,
          agent_name_snapshot: quotation.agent_name_snapshot,
          product_variant_id: quotation.product_variant_id,
          coverage_start_at: quotation.coverage_start_at,
          coverage_end_at: quotation.coverage_end_at,
          application_date: new Date(),
          submission_date: new Date(),
          status: "SUBMITTED",
          total_premium: quotation.total_premium,
          doc_stamps: quotation.doc_stamps,
          vat: quotation.vat,
          lgt: quotation.lgt,
          misc: quotation.misc,
          send_policy_to_email: Boolean(send_policy_to_email),
          send_policy_to_email_on_approval: Boolean(send_policy_to_email_on_approval),
          payment_method,
          payment_remittance,
          bethel_payment_method_id: bethelPaymentMethod ? bethelPaymentMethod.id : null,
          remarks: quotation.remarks,
          source_quotation_id: quotation.id,
        },
      });

      // Vehicles/addresses are already real, persisted rows — nothing to
      // create, just re-linked onto the new application. Vehicles are
      // re-linked in the quotation's own stored order so the join-id map
      // below can place each coverage row against the right one.
      const applicationVehicleIdByQuotationVehicleId = new Map();
      for (const qv of quotation.vehicles) {
        const created = await tx.policyApplicationVehicle.create({
          data: { policy_application_id: application.id, vehicle_id: qv.vehicle_id },
        });
        applicationVehicleIdByQuotationVehicleId.set(qv.id, created.id);
      }

      await tx.applicationCoverage.createMany({
        data: quotation.coverages.map((c) => ({
          application_id: application.id,
          coverage_id: c.coverage_id,
          policy_application_vehicle_id: c.policy_quotation_vehicle_id
            ? applicationVehicleIdByQuotationVehicleId.get(c.policy_quotation_vehicle_id)
            : null,
          coverage_amount: c.coverage_amount,
          premium_amount: c.premium_amount,
          payable_to_bethel: c.payable_to_bethel,
          applied_rate: c.applied_rate,
        })),
      });

      for (const addr of quotation.addresses) {
        await tx.policyApplicationAddress.create({
          data: { policy_application_id: application.id, address_id: addr.address_id, role: addr.role },
        });
      }

      return application;
    });

    // Same "notify on submission" email a fresh POST /policy-applications
    // sends — carried over from the quotation's own send_policy_to_email,
    // per policyApplications.js's toApplicationDetail/toPreviewProps (same
    // shared helpers routes/policyApproval.js already reuses). A mail
    // failure here must never fail the conversion that just happened.
    if (result.send_policy_to_email) {
      try {
        const fullApplication = await prisma.policyApplication.findUnique({
          where: { id: result.id },
          select: applicationDetailSelect,
        });
        const detail = toApplicationDetail(fullApplication);
        if (detail.insured_email) {
          const pdfBuffer = await buildPolicyApplicationPdf(toApplicationPreviewProps(detail));
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
        console.error("[policyQuotations] failed to send submission email", mailErr);
      }
    }

    res.status(201).json(result);
  } catch (err) {
    if (sendIfHttpError(err, res)) return;
    next(err);
  }
});

// PDF download for an already-saved quotation — the Quotation Tracker
// detail popup's "Re-export PDF" action.
router.get("/:id/pdf", validateParams(quotationIdParamSchema), async (req, res, next) => {
  try {
    const scope = await resolveScope(req, res, VIEW_CODE, ADMIN_VIEW_CODE);
    if (!scope) return;

    const where = scope.agentId ? { id: req.params.id, agent_id: scope.agentId } : { id: req.params.id };
    const quotation = await prisma.policyQuotation.findFirst({ where, select: quotationDetailSelect });
    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    const detail = toQuotationDetail(quotation);
    const pdfBuffer = await buildQuotationPdf(toPreviewProps(detail));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${detail.quotation_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// Re-sends the quotation to whatever email is on file for the insured
// customer/company — the Quotation Tracker detail popup's "Resend to client"
// action.
router.post("/:id/resend-email", validateParams(quotationIdParamSchema), async (req, res, next) => {
  try {
    const scope = await resolveScope(req, res, VIEW_CODE, ADMIN_VIEW_CODE);
    if (!scope) return;

    const where = scope.agentId ? { id: req.params.id, agent_id: scope.agentId } : { id: req.params.id };
    const quotation = await prisma.policyQuotation.findFirst({ where, select: quotationDetailSelect });
    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    const detail = toQuotationDetail(quotation);
    if (!detail.insured_email) {
      return res.status(400).json({ error: "This customer/company has no email address on file" });
    }

    // The full quotation detail now lives in the attached PDF (same layout
    // as the on-screen/print preview) rather than duplicated inline — the
    // email body is just a short cover note pointing at it.
    const html = `
      <div style="font-family:Arial,sans-serif;color:#111">
        <p>Dear ${detail.insured_name},</p>
        <p>Please find your quotation from Bethel General Insurance and Surety Corp. attached as a PDF (Quotation No. ${detail.quotation_number}).</p>
        <p>This quotation is not a policy and does not bind coverage. Please contact your agent (${detail.agent_name || detail.agent_code}) with any questions.</p>
      </div>
    `;
    const text = [
      `Dear ${detail.insured_name},`,
      "",
      `Please find your quotation from Bethel General Insurance and Surety Corp. attached as a PDF (Quotation No. ${detail.quotation_number}).`,
      "",
      `This quotation is not a policy and does not bind coverage. Please contact your agent (${detail.agent_name || detail.agent_code}) with any questions.`,
    ].join("\n");

    const pdfBuffer = await buildQuotationPdf(toPreviewProps(detail));

    await sendMail({
      to: detail.insured_email,
      subject: `Your Bethel Insurance Quotation ${detail.quotation_number}`,
      html,
      text,
      attachments: [
        {
          filename: `${detail.quotation_number}.pdf`,
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

module.exports = router;
