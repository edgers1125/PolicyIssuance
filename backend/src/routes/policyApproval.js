const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateBody, validateQuery, validateParams } = require("../middleware/validate");
const { listAllApplicationsQuerySchema, approveApplicationSchema } = require("../schemas/policyApproval");
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

// Every application in the system, from every agent — latest first. The
// Policy Approval page's table.
router.get("/", validateQuery(listAllApplicationsQuerySchema), async (req, res, next) => {
  try {
    const { page, page_size: pageSize } = req.query;

    const [total, applications] = await Promise.all([
      prisma.policyApplication.count(),
      prisma.policyApplication.findMany({
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
          agent: { select: { agent_code: true, agent_name: true } },
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

// Full JSON detail for one application, not scoped to the caller's own agent
// — mirrors GET /policy-applications/:id, plus folds in any recorded changes
// (see applyChangesToDetail above) so an approver always sees the corrected
// picture. Backs the approval dialog's "create a change" form (which needs
// vehicle/coverage ids to reference) and its change list.
router.get("/:id", validateParams(applicationIdParamSchema), async (req, res, next) => {
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
          await tx.address.update({ where: { id: appAddress.address_id }, data: { ...new_address } });
        } else if (change_type === "INSURED_FROM_DATE") {
          changeFrom = application.coverage_start_at.toISOString();
          changeTo = new Date(new_value).toISOString();
        } else if (change_type === "INSURED_NAME_DETAILS") {
          changeFrom =
            application.insured_type === "INDIVIDUAL"
              ? formatInsuredName(application.customer || {})
              : application.company_name_snapshot;
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
    const application = await prisma.policyApplication.findUnique({
      where: { id: req.params.id },
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
        agent: { select: { agent_code: true } },
        product_variant: {
          select: {
            variant_name: true,
            deductible_rate: true,
            authorized_repair_limit_rate: true,
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
            coverage: { select: { coverage_code: true, coverage_name: true, clause: true, pricing_mode: true } },
          },
        },
      },
    });
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }
    if (application.status === "APPROVED") {
      return res.status(409).json({ error: "This application has already been approved" });
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

    const policy = await prisma.$transaction(async (tx) => {
      const createdPolicy = await tx.policy.create({
        data: {
          policy_number: generatePolicyNumber(),
          coc_number: req.body.coc_number ?? null,
          sa_number: req.body.sa_number ?? null,
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
          authorized_repair_limit_rate_snapshot: application.product_variant.authorized_repair_limit_rate,
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
          })),
        });
      }

      await tx.policyApplication.update({ where: { id: application.id }, data: { status: "APPROVED" } });

      await tx.approvalHistory.create({
        data: {
          application_id: application.id,
          approver_id: req.user.userId,
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

    res.status(201).json(policy);
  } catch (err) {
    if (sendIfHttpError(err, res)) return;
    next(err);
  }
});

module.exports = router;
