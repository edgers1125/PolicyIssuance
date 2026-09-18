const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateBody, validateQuery, validateParams } = require("../middleware/validate");
const {
  listAllApplicationsQuerySchema,
  approveApplicationSchema,
  rejectApplicationSchema,
  createAdminApplicationSchema,
} = require("../schemas/policyApproval");
const { resolveVehicleRenewal, resolveRiskAddressRenewal } = require("../lib/policyConflicts");
const { fetchByPriority } = require("../lib/priorityPagination");
const { computeDueDate } = require("../lib/agentPayables");
const { applicationIdParamSchema } = require("../schemas/policyApplications");
const {
  VEHICLE_CHANGE_TYPES,
  CLAUSE_CHANGE_TYPES,
  createApplicationChangeSchema,
} = require("../schemas/policyApplicationChanges");
const {
  applicationDetailSelect,
  toApplicationDetail,
  toPreviewProps,
  applyChangesToDetail,
  formatInsuredName,
  formatAddress,
  createApplicationRecord,
} = require("./policyApplications");
const { buildPolicyApplicationPdf } = require("../pdf/policyApplicationPdf");
const { buildPolicyPdf } = require("../pdf/policyPdf");
const { policyDetailSelect, toPolicyPdfProps } = require("./policies");
const { HttpError, sendIfHttpError } = require("../lib/httpError");
const { sendMail } = require("../lib/mailer");
const { buildApprovalEmailContent } = require("../lib/applicationEmails");

const router = express.Router();

// Which Vehicle column each VEHICLE_* change type corrects.
const VEHICLE_FIELD_BY_CHANGE_TYPE = {
  VEHICLE_MODEL: "model",
  VEHICLE_MV_FILE: "mv_file_no",
  VEHICLE_PLATE_NO: "plate_number",
  VEHICLE_TYPE: "vehicle_type",
  VEHICLE_MAKE: "make",
  VEHICLE_COLOR: "color",
  VEHICLE_ENGINE_NO: "engine_number",
  VEHICLE_CHASSIS_NO: "chassis_number",
};

// Rejects a change whose new value is identical (case/whitespace aside) to
// what's already on file — recording a "correction" that doesn't actually
// correct anything would still show up in the change history and, for
// VEHICLE_*/INSURED_ADDRESS_DETAILS, still fire a real (no-op) write against
// the shared Vehicle/Address row. Skipped for ADD_CLAUSE/REMOVE_CLAUSE, whose
// change_to is always an already-different derived string (appending/
// removing non-empty text can't reproduce the original verbatim) rather than
// a like-for-like replacement. changeFrom of null/undefined means there was
// nothing on file to compare against (e.g. an unset vehicle field) — always
// allowed through.
function assertActuallyChanged(changeFrom, changeTo) {
  if (changeFrom === null || changeFrom === undefined) return;
  const fromStr = String(changeFrom).trim();
  const toStr = changeTo === null || changeTo === undefined ? "" : String(changeTo).trim();
  if (fromStr === toStr) {
    throw new HttpError(400, "The new value is the same as the current value on file — nothing to change");
  }
}

function generatePolicyNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `POL-${datePart}-${randomPart}`;
}

// The Policy Approval page's whole reason for existing is to see across every
// agent's applications, not just the caller's own — the opposite scoping of
// routes/policyApplications.js (own-agent-only), so this is its own router
// rather than a query flag bolted onto that one.
router.use(requireAuth, requirePermission("APPROVE_APPLICATION"));

// Every application in the system, from every agent. Priority-sorted, not a
// plain date sort: a still-undecided application (anything short of
// APPROVED/REJECTED — SUBMITTED or UNDER_REVIEW) always ranks above a
// decided one, so the queue always surfaces what still needs a decision
// first. Within the undecided bucket, oldest `submission_date`
// first (the one that's been waiting longest gets handled first); within the
// decided bucket, newest `created_at` first (a recent decision is more likely
// to still be relevant/referenced than an old one) — see lib/priorityPagination.js
// for why this needs two queries rather than one declarative `orderBy`. The
// Policy Approval page's table.
const DECIDED_APPLICATION_STATUSES = ["APPROVED", "REJECTED"];

router.get("/", validateQuery(listAllApplicationsQuerySchema), async (req, res, next) => {
  try {
    const { page, page_size: pageSize, search, status, policy_type, class_id, agent_id } = req.query;
    const where = {
      ...(status ? { status } : {}),
      ...(policy_type ? { policy_type } : {}),
      ...(class_id ? { product_variant: { insurance_class_id: class_id } } : {}),
      ...(agent_id ? { agent_id } : {}),
      ...(search
        ? {
            OR: [
              { application_number: { contains: search, mode: "insensitive" } },
              { company_name_snapshot: { contains: search, mode: "insensitive" } },
              { customer: { first_name: { contains: search, mode: "insensitive" } } },
              { customer: { last_name: { contains: search, mode: "insensitive" } } },
              { agent: { agent_code: { contains: search, mode: "insensitive" } } },
              { agent: { agent_name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const applicationSelect = {
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
      agent: { select: { agent_code: true, agent_name: true } },
      product_variant: {
        select: { variant_name: true, insurance_class: { select: { class_name: true } } },
      },
    };

    const [total, applications] = await Promise.all([
      prisma.policyApplication.count({ where }),
      fetchByPriority({
        delegate: prisma.policyApplication,
        pendingWhere: { AND: [where, { status: { notIn: DECIDED_APPLICATION_STATUSES } }] },
        decidedWhere: { AND: [where, { status: { in: DECIDED_APPLICATION_STATUSES } }] },
        pendingOrderBy: { submission_date: "asc" },
        decidedOrderBy: { created_at: "desc" },
        select: applicationSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
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
        agent_code: a.agent.agent_code,
        agent_name: a.agent.agent_name,
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

// Every active agent — APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION's "File
// under agent" picker on the admin application form (see POST
// /admin-applications below). Deliberately its own minimal route rather than
// reusing GET /agents (routes/agents.js), which needs MANAGE_AGENTS — a
// different permission an approver filing on an agent's behalf may not hold
// — and returns premium/rate data this picker has no business seeing. Same
// shape/reasoning as routes/policyQuotations.js's own GET /agents. Registered
// before GET /:id below so Express doesn't try to parse "agents" as an
// application id.
router.get("/agents", requirePermission("APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION"), async (req, res, next) => {
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

// Files a policy application under a chosen agent and immediately approves
// it — the same PolicyApplication wizard/intake workflow as POST
// /policy-applications (reusing its own createApplicationRecord()), chained
// straight into the exact same approve workflow as POST /:id/approve
// (reusing approveApplicationRecord() below) rather than leaving the new
// application sitting in the ordinary SUBMITTED queue. The acting user (the
// approver filing this) is recorded as the one who approved it, same
// approver_id column POST /:id/approve itself writes. No coc_number/
// sa_number here — those are approve-time-only fields the PolicyApplication
// wizard this reuses never collects. Unlike POST /policy-applications, this
// never fires the "now under approval, please settle payment" submission
// email (send_policy_to_email is still stored on the row, just not acted on
// here) — the application never actually sits under approval, so that
// notice would misstate what just happened; only the "your policy has been
// approved" email (send_policy_to_email_on_approval, fired from inside
// approveApplicationRecord()) is honored.
router.post(
  "/admin-applications",
  requirePermission("APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION"),
  validateBody(createAdminApplicationSchema),
  async (req, res, next) => {
    try {
      const agent = await prisma.agent.findUnique({ where: { id: req.body.agent_id } });
      if (!agent) {
        return res.status(400).json({ error: "agent_id does not match an existing agent" });
      }

      const application = await createApplicationRecord({ agent, body: req.body, allowBackdating: true });
      const policy = await approveApplicationRecord({ applicationId: application.id, approverUserId: req.user.userId });

      res.status(201).json(policy);
    } catch (err) {
      if (sendIfHttpError(err, res)) return;
      next(err);
    }
  }
);

// Full JSON detail for one application, not scoped to the caller's own agent
// — mirrors GET /policy-applications/:id, plus folds in any recorded changes
// (see applyChangesToDetail above) so an approver always sees the corrected
// picture. Backs the approval dialog's "create a change" form (which needs
// vehicle/coverage ids to reference) and its change list.
router.get("/:id", validateParams(applicationIdParamSchema), async (req, res, next) => {
  try {
    let application = await prisma.policyApplication.findUnique({
      where: { id: req.params.id },
      select: applicationDetailSelect,
    });
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    // Opening an application for review is what actually moves it out of the
    // plain "Submitted" queue — this route is what the Policy Approval
    // table's row-click always hits, so it's the one place this transition
    // can happen without a dedicated "start review" action. Only ever
    // advances forward (SUBMITTED -> UNDER_REVIEW, once); an application
    // already under review or already decided is left exactly as-is.
    if (application.status === "SUBMITTED") {
      application = await prisma.policyApplication.update({
        where: { id: req.params.id },
        data: { status: "UNDER_REVIEW" },
        select: applicationDetailSelect,
      });
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

// PDF for one application, not scoped to the caller's own agent — the Policy
// Approval table's row detail popup. Mirrors
// GET /policy-applications/:id/pdf, just without the agent_id filter, with
// no resend-email route alongside it (an approver reviewing someone else's
// application has no business emailing the customer), and with any recorded
// changes folded in (see applyChangesToDetail above) so the exported PDF
// always reflects the latest corrections, even before approval.
router.get("/:id/pdf", validateParams(applicationIdParamSchema), async (req, res, next) => {
  try {
    const application = await prisma.policyApplication.findUnique({
      where: { id: req.params.id },
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

// Every recorded change for one application, oldest first — the approval
// dialog's change-history list.
router.get("/:id/changes", validateParams(applicationIdParamSchema), async (req, res, next) => {
  try {
    const application = await prisma.policyApplication.findUnique({
      where: { id: req.params.id },
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

// Records one correction against an application — the approval dialog's
// "Create Change" action. Never touches the PolicyApplication row itself;
// for VEHICLE_*/INSURED_ADDRESS_DETAILS this also permanently updates the
// underlying Vehicle/Address row (so the correction is already there next
// time that same record is selected), and for ADD_CLAUSE/REMOVE_CLAUSE it
// amends this one application's copy of the coverage's clause text without
// touching the shared ProductCoverage catalog entry. change_from/change_to
// are always computed here, never trusted from the client.
router.post(
  "/:id/changes",
  validateParams(applicationIdParamSchema),
  validateBody(createApplicationChangeSchema),
  async (req, res, next) => {
    try {
      const application = await prisma.policyApplication.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          status: true,
          insured_type: true,
          coverage_start_at: true,
          company_name_snapshot: true,
          customer: { select: { first_name: true, last_name: true, middle_name: true } },
        },
      });
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      if (application.status === "APPROVED") {
        return res.status(409).json({ error: "This application has already been approved — no further changes can be recorded" });
      }
      if (application.status === "REJECTED") {
        return res.status(409).json({ error: "This application has been rejected — no further changes can be recorded" });
      }

      const { change_type, application_vehicle_id, application_coverage_id, new_value, new_address, effective_date, remarks } =
        req.body;

      const change = await prisma.$transaction(async (tx) => {
        let changeFrom = null;
        let changeTo = new_value;

        if (VEHICLE_CHANGE_TYPES.has(change_type)) {
          const appVehicle = await tx.policyApplicationVehicle.findFirst({
            where: { id: application_vehicle_id, policy_application_id: application.id },
            select: { vehicle_id: true, vehicle: true },
          });
          if (!appVehicle) {
            throw new HttpError(400, "application_vehicle_id does not belong to this application");
          }
          const field = VEHICLE_FIELD_BY_CHANGE_TYPE[change_type];
          changeFrom = appVehicle.vehicle[field] ?? null;
          assertActuallyChanged(changeFrom, changeTo);
          await tx.vehicle.update({ where: { id: appVehicle.vehicle_id }, data: { [field]: new_value } });
        } else if (change_type === "INSURED_ADDRESS_DETAILS") {
          const appAddress = await tx.policyApplicationAddress.findFirst({
            where: { policy_application_id: application.id, role: "INSURED" },
            select: {
              address_id: true,
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
          });
          if (!appAddress) {
            throw new HttpError(400, "This application has no insured address to change");
          }
          // Every field updateAddressSchema accepts (minus estimated_value —
          // only meaningful for a risk address), not just address_line_1, so
          // change_from/change_to reflect the whole address, not one line of
          // it. tx.address.update below writes the same full set, so the
          // correction is already there the next time this Address row is
          // selected on a future application/quotation, same as the other
          // permanently-mutating change types (VEHICLE_*).
          changeFrom = formatAddress(appAddress.address);
          changeTo = formatAddress(new_address);
          assertActuallyChanged(changeFrom, changeTo);
          await tx.address.update({ where: { id: appAddress.address_id }, data: { ...new_address } });
        } else if (change_type === "INSURED_FROM_DATE") {
          changeFrom = application.coverage_start_at.toISOString();
          changeTo = new Date(new_value).toISOString();
          assertActuallyChanged(changeFrom, changeTo);
        } else if (change_type === "INSURED_NAME_DETAILS") {
          changeFrom =
            application.insured_type === "INDIVIDUAL"
              ? formatInsuredName(application.customer || {})
              : application.company_name_snapshot;
          assertActuallyChanged(changeFrom, changeTo);
        } else if (CLAUSE_CHANGE_TYPES.has(change_type)) {
          const appCoverage = await tx.applicationCoverage.findFirst({
            where: { id: application_coverage_id, application_id: application.id },
            select: { coverage: { select: { clause: true } } },
          });
          if (!appCoverage) {
            throw new HttpError(400, "application_coverage_id does not belong to this application");
          }
          const currentClause = appCoverage.coverage.clause || "";
          changeFrom = currentClause;
          if (change_type === "ADD_CLAUSE") {
            changeTo = currentClause ? `${currentClause}\n${new_value}` : new_value;
          } else {
            if (!currentClause.includes(new_value)) {
              throw new HttpError(400, "That text was not found in the coverage's current clause");
            }
            changeTo = currentClause.replace(new_value, "").trim();
          }
        }

        return tx.policyApplicationChange.create({
          data: {
            policy_application_id: application.id,
            application_vehicle_id: VEHICLE_CHANGE_TYPES.has(change_type) ? application_vehicle_id : null,
            application_coverage_id: CLAUSE_CHANGE_TYPES.has(change_type) ? application_coverage_id : null,
            change_type,
            change_from: changeFrom,
            change_to: changeTo,
            effective_date: effective_date || null,
            remarks: remarks || null,
            created_by_user_id: req.user.userId,
          },
        });
      });

      res.status(201).json(change);
    } catch (err) {
      if (sendIfHttpError(err, res)) return;
      next(err);
    }
  }
);

// Approves the application — the approval dialog's "Approve" action. Issues
// the actual Policy (with its own independent PolicyVehicle/PolicyAddress/
// PolicyCoverage rows, per the existing "three parallel transactional
// entities" pattern — see CLAUDE.md), marks the application APPROVED, and
// logs an ApprovalHistory row. VEHICLE_*/INSURED_ADDRESS_DETAILS changes need
// no special handling here — they already live on the Vehicle/Address rows
// this reads fresh; INSURED_FROM_DATE/INSURED_NAME_DETAILS/clause changes are
// folded in explicitly since nothing else carries them forward.
router.post(
  "/:id/approve",
  validateParams(applicationIdParamSchema),
  validateBody(approveApplicationSchema),
  async (req, res, next) => {
    try {
      const policy = await approveApplicationRecord({
        applicationId: req.params.id,
        approverUserId: req.user.userId,
        coc_number: req.body.coc_number,
        sa_number: req.body.sa_number,
      });
      res.status(201).json(policy);
    } catch (err) {
      if (sendIfHttpError(err, res)) return;
      next(err);
    }
  }
);

// The actual "issue the Policy" logic behind POST /:id/approve above —
// pulled into its own function so routes/policyApproval.js's own admin
// create-and-auto-approve flow (POST /admin-applications) can run the exact
// same approve workflow right after createApplicationRecord()
// (routes/policyApplications.js) creates the application, with
// approverUserId set to whichever user is actually filing (the current
// caller either way — a human approver here, or the admin creating the
// application there). Every business-rule rejection throws HttpError
// instead of writing directly to `res` (which this function no longer has)
// — both call sites already wrap their own call in a try/catch ending with
// sendIfHttpError(err, res).
async function approveApplicationRecord({ applicationId, approverUserId, coc_number, sa_number }) {
    const application = await prisma.policyApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        insured_type: true,
        customer_id: true,
        company_id: true,
        company_name_snapshot: true,
        agent_id: true,
        agent_name_snapshot: true,
        product_variant_id: true,
        coverage_start_at: true,
        coverage_end_at: true,
        send_policy_to_email_on_approval: true,
        // Everything below this line is new — feeds the *_snapshot columns
        // on Policy/PolicyVehicle/PolicyAddress/PolicyCoverage (see
        // schema/policies.prisma) so the issued policy's own record — and
        // any PDF built from it — can never drift from how it actually
        // looked at the moment of approval, even if the Agent/ProductVariant/
        // Vehicle/Address/ProductCoverage rows it's joined to are edited
        // afterward.
        total_premium: true,
        doc_stamps: true,
        vat: true,
        lgt: true,
        misc: true,
        remarks: true,
        // Own policy_number of whatever this application renews/replaces, if
        // any — frozen onto the issued Policy's own renewed_policy_number_snapshot
        // (see schema/policies.prisma) so the printed "Renewing/Replacing:"
        // line never needs a live join back to that other Policy row.
        renewed_policy: { select: { policy_number: true } },
        agent: { select: { agent_code: true, payment_terms_days: true } },
        product_variant: {
          select: {
            variant_name: true,
            deductible_rate: true,
            minimum_deductible_amount: true,
            insurance_class: { select: { class_name: true } },
          },
        },
        customer: { select: { first_name: true, last_name: true, middle_name: true } },
        vehicles: {
          select: {
            vehicle_id: true,
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
                // Needed to finalize the assessment date below — see the
                // vehicle-finalization block right after policyVehicle rows
                // are created.
                initial_assessment_date: true,
              },
            },
          },
        },
        addresses: {
          select: {
            address_id: true,
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
            id: true,
            coverage_id: true,
            coverage_amount: true,
            premium_amount: true,
            // What's actually owed to Bethel for this row, and the net rate
            // that produced it — frozen at submission time (see
            // ApplicationCoverage's own comment). Summed below into the
            // AgentPayableTransaction credited to the filing agent once this
            // application is approved, and also copied verbatim onto the
            // issued PolicyCoverage row (see the policyCoverage.createMany
            // call below) so the policy keeps a durable, "for transparency"
            // record of exactly what the agent's rates were at the moment
            // this policy was actually written, even if that agent's own
            // net rates are edited afterward.
            payable_to_bethel: true,
            applied_rate: true,
            coverage: { select: { coverage_code: true, coverage_name: true, clause: true, pricing_mode: true, is_misc: true } },
          },
        },
      },
    });
    if (!application) {
      throw new HttpError(404, "Application not found");
    }
    if (application.status === "APPROVED") {
      throw new HttpError(409, "This application has already been approved");
    }
    if (application.status === "REJECTED") {
      throw new HttpError(409, "This application has been rejected and can no longer be approved");
    }

    const changes = await prisma.policyApplicationChange.findMany({
      where: { policy_application_id: application.id },
      orderBy: { created_at: "asc" },
    });

    // Same "period length is fixed, INSURED_FROM_DATE shifts the whole
    // period" rule as applyChangesToDetail (routes/policyApplications.js) —
    // duplicated here rather than shared since this handler needs the
    // resulting expiryDate for the Policy row it's about to create, not a
    // full detail object.
    let effectiveDate = application.coverage_start_at;
    let expiryDate = application.coverage_end_at;
    const fromDateChange = changes.filter((c) => c.change_type === "INSURED_FROM_DATE").pop();
    if (fromDateChange) {
      const originalDurationMs = application.coverage_end_at.getTime() - application.coverage_start_at.getTime();
      effectiveDate = new Date(fromDateChange.change_to);
      expiryDate = new Date(effectiveDate.getTime() + originalDurationMs);
    }

    // Re-runs the same "no double-insuring the same asset" rule enforced at
    // submission time (see lib/policyConflicts.js) — an application can sit
    // pending for a while, so this closes the gap where a conflicting policy
    // for one of its vehicles/its risk address got issued (or its own dates
    // moved via an INSURED_FROM_DATE change) sometime between submission and
    // this approval. excludeApplicationId keeps this same application's own
    // still-pending PolicyApplicationVehicle/PolicyApplicationAddress rows
    // from flagging themselves as a conflict — it's still in a pre-APPROVED
    // status at the moment this runs. Throws (409, with a structured
    // `conflict` body) via sendIfHttpError in the outer catch below.
    const vehicleIdsForApproval = application.vehicles.map((v) => v.vehicle_id);
    if (vehicleIdsForApproval.length) {
      await resolveVehicleRenewal(vehicleIdsForApproval, effectiveDate, expiryDate, {
        enforce: true,
        excludeApplicationId: application.id,
      });
    }
    const riskAddressForApproval = application.addresses.find((a) => a.role === "RISK");
    if (riskAddressForApproval) {
      await resolveRiskAddressRenewal(riskAddressForApproval.address_id, effectiveDate, expiryDate, {
        enforce: true,
        excludeApplicationId: application.id,
      });
    }

    let customerNameSnapshot =
      application.insured_type === "INDIVIDUAL" ? formatInsuredName(application.customer || {}) : null;
    let companyNameSnapshot = application.insured_type === "CORPORATE" ? application.company_name_snapshot : null;
    const nameChange = changes.filter((c) => c.change_type === "INSURED_NAME_DETAILS").pop();
    if (nameChange) {
      if (application.insured_type === "INDIVIDUAL") customerNameSnapshot = nameChange.change_to;
      else companyNameSnapshot = nameChange.change_to;
    }

    const clauseOverrideByCoverageId = new Map();
    for (const c of changes) {
      if (CLAUSE_CHANGE_TYPES.has(c.change_type) && c.application_coverage_id) {
        clauseOverrideByCoverageId.set(c.application_coverage_id, c.change_to);
      }
    }

    // What this agent actually owes Bethel for the policy — summed across
    // every coverage line's own payable_to_bethel (the floor cost the agent's
    // premium_amount is priced against, never the agent's own margin on top
    // of it — see lib/coveragePricing.js). Credited to their payable ledger
    // the moment this application becomes an issued Policy: the agent has
    // (or is about to) collect the full premium from the insured, and this
    // is the portion of it that must flow back to Bethel, not the margin the
    // agent keeps. See AgentPayableTransaction (agentPayables.prisma) for why
    // this is a signed-amount ledger entry rather than a running balance
    // column on Agent.
    const amountPayableToBethel = application.coverages.reduce(
      (sum, c) => sum + Number(c.payable_to_bethel),
      0
    );

    const policy = await prisma.$transaction(async (tx) => {
      const createdPolicy = await tx.policy.create({
        data: {
          policy_number: generatePolicyNumber(),
          coc_number: coc_number ?? null,
          sa_number: sa_number ?? null,
          application_id: application.id,
          customer_id: application.customer_id,
          customer_name_snapshot: customerNameSnapshot,
          company_id: application.company_id,
          company_name_snapshot: companyNameSnapshot,
          agent_id: application.agent_id,
          agent_name_snapshot: application.agent_name_snapshot,
          agent_code_snapshot: application.agent.agent_code,
          product_variant_id: application.product_variant_id,
          class_name_snapshot: application.product_variant.insurance_class.class_name,
          variant_name_snapshot: application.product_variant.variant_name,
          deductible_rate_snapshot: application.product_variant.deductible_rate,
          minimum_deductible_amount_snapshot: application.product_variant.minimum_deductible_amount,
          renewed_policy_number_snapshot: application.renewed_policy?.policy_number ?? null,
          issue_date: new Date(),
          effective_date: effectiveDate,
          expiry_date: expiryDate,
          policy_status: "ACTIVE",
          total_premium: application.total_premium,
          doc_stamps: application.doc_stamps,
          vat: application.vat,
          lgt: application.lgt,
          misc: application.misc,
          remarks: application.remarks,
        },
      });

      // Every issued policy needs to be uploaded into Bethel's in-lease
      // system — this is what actually populates the In-Lease Backlogs page
      // (routes/inLeaseBacklog.js), replacing the old flat
      // Policy.added_to_inlease boolean. Created unaccomplished; who
      // eventually uploads it isn't necessarily this approver, so
      // accomplished_by_user_id is deliberately left null here rather than
      // set to approverUserId.
      await tx.inLeaseBacklog.create({
        data: { policy_id: createdPolicy.id, type: "FOR_UPLOAD" },
      });

      if (application.vehicles.length) {
        await tx.policyVehicle.createMany({
          data: application.vehicles.map((v) => ({
            policy_id: createdPolicy.id,
            vehicle_id: v.vehicle_id,
            plate_number_snapshot: v.vehicle.plate_number,
            mv_file_no_snapshot: v.vehicle.mv_file_no,
            engine_number_snapshot: v.vehicle.engine_number,
            chassis_number_snapshot: v.vehicle.chassis_number,
            make_snapshot: v.vehicle.make,
            model_snapshot: v.vehicle.model,
            year_model_snapshot: v.vehicle.year_model,
            vehicle_type_snapshot: v.vehicle.vehicle_type,
            color_snapshot: v.vehicle.color,
            no_of_seats_snapshot: v.vehicle.no_of_seats,
          })),
        });

        // Finalizes each not-yet-assessed vehicle's initial_assessment_date
        // to this policy's own effective_date — the real date of inception —
        // rather than whenever the application happened to be filed, so a
        // later renewal's depreciation always ticks a full year from the
        // true anniversary. A vehicle that already has one (from an earlier
        // approved policy) is left untouched — see lib/vehicleValue.js and
        // the reassign_owner/create branches in
        // policyApplications.js/policyQuotations.js/vehicles.js, which all
        // leave it null until this moment.
        const vehicleIdsToFinalize = application.vehicles
          .filter((v) => !v.vehicle.initial_assessment_date)
          .map((v) => v.vehicle_id);
        if (vehicleIdsToFinalize.length) {
          await tx.vehicle.updateMany({
            where: { id: { in: vehicleIdsToFinalize } },
            data: { initial_assessment_date: effectiveDate },
          });
        }
      }
      if (application.addresses.length) {
        await tx.policyAddress.createMany({
          data: application.addresses.map((a) => ({
            policy_id: createdPolicy.id,
            address_id: a.address_id,
            role: a.role,
            formatted_address_snapshot: formatAddress(a.address) || "",
          })),
        });
      }
      if (application.coverages.length) {
        await tx.policyCoverage.createMany({
          data: application.coverages.map((c) => ({
            policy_id: createdPolicy.id,
            coverage_id: c.coverage_id,
            coverage_code_snapshot: c.coverage.coverage_code,
            coverage_name_snapshot: c.coverage.coverage_name,
            clause_snapshot: clauseOverrideByCoverageId.get(c.id) ?? (c.coverage.clause || ""),
            pricing_mode_snapshot: c.coverage.pricing_mode,
            coverage_amount: c.coverage_amount,
            premium_amount: c.premium_amount,
            // Frozen off the ApplicationCoverage row's own values — the
            // agent's net rate as it actually stood at submission time, and
            // what that rate worked out to in pesos for this specific
            // coverage — so an issued policy carries a permanent, "for
            // transparency" record of the rate it was actually priced at,
            // even if that agent's own net rate is edited (or their whole
            // company's rates are) at any point afterward. Previously left
            // null at issuance (only ever populated by an ADD_COVERAGE
            // endorsement's own new row) — see this column's own schema
            // comment for why that was a gap worth closing here too.
            payable_to_bethel: c.payable_to_bethel,
            applied_rate: c.applied_rate,
            is_misc_snapshot: c.coverage.is_misc,
          })),
        });
      }

      // Credits the filing agent's payable ledger with what they owe Bethel
      // for this policy — see amountPayableToBethel's own note above.
      // Recorded even when it's 0 (every coverage priced with no margin at
      // all still owes Bethel its own floor cost — 0 only when that floor
      // cost itself is 0, e.g. a VEHICLE_SEATS_BASED coverage under its own
      // bracket threshold), so the ledger's own row-per-policy history stays
      // complete rather than silently skipping some approvals. Agent.payable
      // (the denormalized running-balance cache the Accounting Overview page
      // reads) is incremented in the same transaction so it can never drift
      // from the ledger it's summarizing.
      // This ISSUANCE row is the policy's own original payable-aging bucket
      // (see AgentPayableTransaction.due_date/remaining_amount's own schema
      // comments and lib/agentPayables.js) — due_date is frozen off the
      // agent's payment_terms_days as of right now, never recomputed if that
      // value changes later.
      await tx.agentPayableTransaction.create({
        data: {
          agent_id: application.agent_id,
          policy_id: createdPolicy.id,
          transaction_type: "ISSUANCE",
          amount: amountPayableToBethel,
          due_date: computeDueDate(createdPolicy.issue_date, application.agent.payment_terms_days),
          remaining_amount: amountPayableToBethel,
        },
      });
      await tx.agent.update({
        where: { id: application.agent_id },
        data: { payable: { increment: amountPayableToBethel } },
      });

      await tx.policyApplication.update({ where: { id: application.id }, data: { status: "APPROVED" } });

      await tx.approvalHistory.create({
        data: {
          application_id: application.id,
          approver_id: approverUserId,
          decision: "APPROVED",
          decision_date: new Date(),
        },
      });

      return createdPolicy;
    });

    // Sent only when the agent opted into it at filing/submit time — the
    // "your policy has been approved" notice, with the issued Policy's own
    // signed PDF attached (pdf/policyPdf.js, via the same toPolicyPdfProps
    // mapper routes/policies.js's GET /:id/pdf uses). A mail failure here
    // must never fail the approval that already committed.
    if (application.send_policy_to_email_on_approval) {
      try {
        const fullApplication = await prisma.policyApplication.findUnique({
          where: { id: application.id },
          select: applicationDetailSelect,
        });
        const detail = applyChangesToDetail(toApplicationDetail(fullApplication), changes);
        if (detail.insured_email) {
          // Re-fetched (rather than reusing vehiclesForPdf/coveragesForPdf/
          // insuredAddressSnapshot above) so this goes through the exact same
          // mapping routes/policies.js's GET /:id/pdf uses for every later
          // re-export — one shared mapper (toPolicyPdfProps), so the emailed
          // copy and any future re-export of this same policy can never
          // disagree with each other. Also the signed, final document (see
          // pdf/policyPdf.js) — never the application builder used above for
          // GET /policy-approval/:id/pdf, since that one's still a
          // pre-approval draft/re-export, not the issued Policy itself.
          const fullPolicy = await prisma.policy.findUnique({ where: { id: policy.id }, select: policyDetailSelect });
          const pdfBuffer = await buildPolicyPdf(toPolicyPdfProps(fullPolicy));
          const { subject, html, text } = buildApprovalEmailContent({ ...detail, policy_number: policy.policy_number, coverage_start_at: policy.effective_date, coverage_end_at: policy.expiry_date });
          await sendMail({
            to: detail.insured_email,
            subject,
            html,
            text,
            attachments: [{ filename: `${policy.policy_number}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
          });
        }
      } catch (mailErr) {
        console.error("[policyApproval] failed to send approval email", mailErr);
      }
    }

  return policy;
}

// Rejects the application — the approval dialog's "Reject" action. Never
// issues a Policy; just marks the application REJECTED and logs an
// ApprovalHistory row (decision: REJECTED, comments: the required remarks).
// There's no "un-reject" — a rejected application is a dead end, same as an
// approved one is immutable in the other direction (both are terminal
// ApplicationStatus values with no route that writes over them).
router.post(
  "/:id/reject",
  validateParams(applicationIdParamSchema),
  validateBody(rejectApplicationSchema),
  async (req, res, next) => {
    try {
      const application = await prisma.policyApplication.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true },
      });
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      if (application.status === "APPROVED") {
        return res.status(409).json({ error: "This application has already been approved and can no longer be rejected" });
      }
      if (application.status === "REJECTED") {
        return res.status(409).json({ error: "This application has already been rejected" });
      }

      await prisma.$transaction([
        prisma.policyApplication.update({ where: { id: application.id }, data: { status: "REJECTED" } }),
        prisma.approvalHistory.create({
          data: {
            application_id: application.id,
            approver_id: req.user.userId,
            decision: "REJECTED",
            comments: req.body.remarks,
            decision_date: new Date(),
          },
        }),
      ]);

      res.json({ id: application.id, status: "REJECTED" });
    } catch (err) {
      if (sendIfHttpError(err, res)) return;
      next(err);
    }
  }
);

module.exports = router;
