const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateQuery, validateParams } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const { listPoliciesQuerySchema, policyIdParamSchema } = require("../schemas/policies");
const { buildPolicyPdf } = require("../pdf/policyPdf");
const { sendMail } = require("../lib/mailer");
const { sendIfHttpError } = require("../lib/httpError");

const router = express.Router();

// Everything toPolicyPdfProps/toPolicyDetail below need — every field here
// comes straight off Policy/PolicyVehicle/PolicyAddress/PolicyCoverage's own
// *_snapshot columns (or, for charges, their plain owned columns), never off
// a live join to Vehicle/Agent/ProductVariant/ProductCoverage — that's the
// whole point of the snapshot columns added alongside Policy's issuance (see
// CLAUDE.md's "Issued policy" row): an already-issued policy's document must
// be exactly reconstructable from its own frozen record alone.
const policyDetailSelect = {
  id: true,
  policy_number: true,
  coc_number: true,
  sa_number: true,
  customer_id: true,
  company_id: true,
  // Email is never snapshotted (same convention as toApplicationDetail's own
  // insured_email) — a resend should always reach whatever address is
  // currently on file, not a possibly-years-stale one frozen at issuance.
  customer: { select: { email: true } },
  company: { select: { email: true } },
  customer_name_snapshot: true,
  company_name_snapshot: true,
  agent_code_snapshot: true,
  class_name_snapshot: true,
  variant_name_snapshot: true,
  deductible_rate_snapshot: true,
  authorized_repair_limit_rate_snapshot: true,
  issue_date: true,
  effective_date: true,
  expiry_date: true,
  policy_status: true,
  total_premium: true,
  doc_stamps: true,
  vat: true,
  lgt: true,
  misc: true,
  remarks: true,
  agent_id: true,
  vehicles: {
    select: {
      plate_number_snapshot: true,
      mv_file_no_snapshot: true,
      engine_number_snapshot: true,
      chassis_number_snapshot: true,
      make_snapshot: true,
      model_snapshot: true,
      year_model_snapshot: true,
      vehicle_type_snapshot: true,
      color_snapshot: true,
      no_of_seats_snapshot: true,
    },
  },
  addresses: {
    select: { role: true, formatted_address_snapshot: true },
  },
  coverages: {
    select: {
      coverage_name_snapshot: true,
      clause_snapshot: true,
      pricing_mode_snapshot: true,
      coverage_amount: true,
      premium_amount: true,
    },
  },
};

// Maps a policyDetailSelect-shaped row onto pdf/policyPdf.js's buildPolicyPdf
// prop shape. Shared by GET /:id/pdf below and, on approval, by
// routes/policyApproval.js's approval-notification email attachment — one
// mapper, so the emailed copy and any later re-export can never disagree.
function toPolicyPdfProps(policy) {
  const insuredAddress = policy.addresses.find((a) => a.role === "INSURED");
  return {
    policyNumber: policy.policy_number,
    cocNumber: policy.coc_number,
    saNumber: policy.sa_number,
    classNameLabel: policy.class_name_snapshot,
    variantName: policy.variant_name_snapshot,
    insuredName: policy.customer_name_snapshot || policy.company_name_snapshot,
    insuredAddress: insuredAddress ? insuredAddress.formatted_address_snapshot : null,
    agentCode: policy.agent_code_snapshot,
    issueDate: policy.issue_date,
    coverageStartAt: policy.effective_date,
    coverageEndAt: policy.expiry_date,
    vehicles: policy.vehicles.map((v) => ({
      plate_number: v.plate_number_snapshot,
      mv_file_no: v.mv_file_no_snapshot,
      engine_number: v.engine_number_snapshot,
      chassis_number: v.chassis_number_snapshot,
      make: v.make_snapshot,
      model: v.model_snapshot,
      year_model: v.year_model_snapshot,
      vehicle_type: v.vehicle_type_snapshot,
      color: v.color_snapshot,
      no_of_seats: v.no_of_seats_snapshot,
    })),
    coverages: policy.coverages.map((c) => ({
      name: c.coverage_name_snapshot,
      clause: c.clause_snapshot,
      amount: c.coverage_amount,
      premium: c.premium_amount,
      pricing_mode: c.pricing_mode_snapshot,
    })),
    deductibleRate: policy.deductible_rate_snapshot,
    authorizedRepairLimitRate: policy.authorized_repair_limit_rate_snapshot,
    totalPremium: policy.total_premium,
    docStamps: policy.doc_stamps,
    vat: policy.vat,
    lgt: policy.lgt,
    misc: policy.misc,
    totalAmount:
      Number(policy.total_premium) + Number(policy.doc_stamps) + Number(policy.vat) + Number(policy.lgt) + Number(policy.misc),
    remarks: policy.remarks,
  };
}

// Flat JSON detail for the Client Policies page's row-detail dialog — mostly
// the same data as toPolicyPdfProps, just without the vehicle/coverage
// breakdown the PDF itself already shows.
function toPolicyDetail(policy) {
  const insuredAddress = policy.addresses.find((a) => a.role === "INSURED");
  return {
    id: policy.id,
    policy_number: policy.policy_number,
    coc_number: policy.coc_number,
    sa_number: policy.sa_number,
    insured_name: policy.customer_name_snapshot || policy.company_name_snapshot,
    insured_address: insuredAddress ? insuredAddress.formatted_address_snapshot : null,
    agent_code: policy.agent_code_snapshot,
    class_name: policy.class_name_snapshot,
    variant_name: policy.variant_name_snapshot,
    policy_status: policy.policy_status,
    issue_date: policy.issue_date,
    effective_date: policy.effective_date,
    expiry_date: policy.expiry_date,
    total_premium: policy.total_premium,
    doc_stamps: policy.doc_stamps,
    vat: policy.vat,
    lgt: policy.lgt,
    misc: policy.misc,
    remarks: policy.remarks,
    total_amount:
      Number(policy.total_premium) + Number(policy.doc_stamps) + Number(policy.vat) + Number(policy.lgt) + Number(policy.misc),
  };
}

// The Client Policies page — an agent's own book of already-issued policies
// (across every one of their clients), scoped to the caller's own agent_id
// the same way GET /policy-applications is (own-agent-only, no admin tier —
// nothing in this request asked for a cross-agent view the way Policy
// Approval has one).
router.use(requireAuth, requirePermission("VIEW_POLICIES"));

router.get("/", validateQuery(listPoliciesQuerySchema), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "No agent is linked to this account" });
    }
    const { page, page_size: pageSize } = req.query;
    const where = { agent_id: agentId };

    const [total, policies] = await Promise.all([
      prisma.policy.count({ where }),
      prisma.policy.findMany({
        where,
        orderBy: { issue_date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          policy_number: true,
          coc_number: true,
          sa_number: true,
          customer_name_snapshot: true,
          company_name_snapshot: true,
          class_name_snapshot: true,
          variant_name_snapshot: true,
          policy_status: true,
          issue_date: true,
          effective_date: true,
          expiry_date: true,
          total_premium: true,
        },
      }),
    ]);

    res.json({
      data: policies.map((p) => ({
        id: p.id,
        policy_number: p.policy_number,
        coc_number: p.coc_number,
        sa_number: p.sa_number,
        insured_name: p.customer_name_snapshot || p.company_name_snapshot,
        class_name: p.class_name_snapshot,
        variant_name: p.variant_name_snapshot,
        policy_status: p.policy_status,
        issue_date: p.issue_date,
        effective_date: p.effective_date,
        expiry_date: p.expiry_date,
        total_premium: p.total_premium,
      })),
      total,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", validateParams(policyIdParamSchema), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "No agent is linked to this account" });
    }
    const policy = await prisma.policy.findFirst({
      where: { id: req.params.id, agent_id: agentId },
      select: policyDetailSelect,
    });
    if (!policy) {
      return res.status(404).json({ error: "Policy not found" });
    }
    res.json(toPolicyDetail(policy));
  } catch (err) {
    next(err);
  }
});

// The signed policy PDF — see pdf/policyPdf.js. Built purely from this
// Policy's own frozen snapshot fields, so it always matches exactly what was
// approved, even if the Vehicle/Agent/ProductVariant/ProductCoverage rows it
// was originally sourced from have since changed.
router.get("/:id/pdf", validateParams(policyIdParamSchema), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "No agent is linked to this account" });
    }
    const policy = await prisma.policy.findFirst({
      where: { id: req.params.id, agent_id: agentId },
      select: policyDetailSelect,
    });
    if (!policy) {
      return res.status(404).json({ error: "Policy not found" });
    }
    const pdfBuffer = await buildPolicyPdf(toPolicyPdfProps(policy));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${policy.policy_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// Re-sends the issued policy's own signed PDF to whatever email is on file
// for the insured customer/company — the Client Policies page's "Resend to
// client" action. Mirrors policyApplications.js's/policyQuotations.js's own
// resend routes, just against the final Policy document (pdf/policyPdf.js)
// instead of a pre-approval one.
router.post("/:id/resend-email", validateParams(policyIdParamSchema), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "No agent is linked to this account" });
    }
    const policy = await prisma.policy.findFirst({
      where: { id: req.params.id, agent_id: agentId },
      select: policyDetailSelect,
    });
    if (!policy) {
      return res.status(404).json({ error: "Policy not found" });
    }

    const insuredEmail = policy.customer?.email || policy.company?.email;
    if (!insuredEmail) {
      return res.status(400).json({ error: "This customer/company has no email address on file" });
    }

    const insuredName = policy.customer_name_snapshot || policy.company_name_snapshot;
    const html = `
      <div style="font-family:Arial,sans-serif;color:#111">
        <p>Dear ${insuredName},</p>
        <p>Please find your policy from Bethel General Insurance and Surety Corp. attached as a PDF (Policy No. ${policy.policy_number}).</p>
        <p>Please contact your agent (${policy.agent_code_snapshot}) with any questions.</p>
      </div>
    `;
    const text = [
      `Dear ${insuredName},`,
      "",
      `Please find your policy from Bethel General Insurance and Surety Corp. attached as a PDF (Policy No. ${policy.policy_number}).`,
      "",
      `Please contact your agent (${policy.agent_code_snapshot}) with any questions.`,
    ].join("\n");

    const pdfBuffer = await buildPolicyPdf(toPolicyPdfProps(policy));

    await sendMail({
      to: insuredEmail,
      subject: `Your Bethel Insurance Policy ${policy.policy_number}`,
      html,
      text,
      attachments: [{ filename: `${policy.policy_number}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
    });

    res.json({ sent: true, to: insuredEmail });
  } catch (err) {
    if (sendIfHttpError(err, res)) return;
    next(err);
  }
});

// Everything the Policy Applications wizard needs to open pre-filled from an
// already-issued Policy — the Client Policies page's "Renew This Policy"
// action. Unlike policyDetailSelect above (built for a read-only document),
// this reads the *live* Vehicle/Address rows behind the policy's vehicle_id/
// address_id FKs (not the frozen *_snapshot columns) and hands back real
// existing_vehicle_id/existing_address_id/existing_customer_id/
// existing_company_id — the same "reuse an on-file record" shape the wizard
// already knows how to prefill from (see PolicyApplication.jsx's own plate-
// lookup/address-Autocomplete reuse flows), since a renewal should carry
// forward whatever these records currently look like, corrections included,
// not a stale copy of how they looked at the original policy's issuance.
// Coverage selections can only be reconstructed as "applies to all
// vehicles" (vehicle_indices: null) — PolicyCoverage rows don't retain which
// vehicle a coverage was originally scoped to (see schema/policies.prisma) —
// the agent can re-narrow it on the form same as any other application.
router.get("/:id/renewal-prefill", validateParams(policyIdParamSchema), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "No agent is linked to this account" });
    }
    const policy = await prisma.policy.findFirst({
      where: { id: req.params.id, agent_id: agentId },
      select: {
        id: true,
        policy_number: true,
        customer_id: true,
        company_id: true,
        product_variant_id: true,
        effective_date: true,
        expiry_date: true,
        product_variant: {
          select: { insurance_class: { select: { id: true, class_name: true } } },
        },
        vehicles: { select: { vehicle_id: true } },
        addresses: { select: { role: true, address_id: true } },
        coverages: { select: { coverage_id: true, coverage_amount: true, premium_amount: true } },
      },
    });
    if (!policy) {
      return res.status(404).json({ error: "Policy not found" });
    }

    const [vehicles, addressRows] = await Promise.all([
      prisma.vehicle.findMany({ where: { id: { in: policy.vehicles.map((v) => v.vehicle_id) } } }),
      prisma.address.findMany({ where: { id: { in: policy.addresses.map((a) => a.address_id) } } }),
    ]);
    const addressById = new Map(addressRows.map((a) => [a.id, a]));

    function toAddressPrefill(addressId) {
      const a = addressById.get(addressId);
      if (!a) return null;
      return {
        existing_address_id: a.id,
        address_line_1: a.address_line_1,
        address_line_2: a.address_line_2 || "",
        barangay: a.barangay || "",
        city: a.city,
        province: a.province,
        postal_code: a.postal_code || "",
        country: a.country || "Philippines",
        estimated_value: a.estimated_value ?? "",
      };
    }

    const insuredAddressRow = policy.addresses.find((a) => a.role === "INSURED");
    const riskAddressRow = policy.addresses.find((a) => a.role === "RISK");

    // Same length as the policy actually ran (in whole days) — a starting
    // guess for the period toggle; the agent can pick a different one if
    // this product variant no longer offers it.
    const coveragePeriodDays = Math.round(
      (new Date(policy.expiry_date).getTime() - new Date(policy.effective_date).getTime()) / 86400000
    );

    res.json({
      renewed_policy_id: policy.id,
      renewed_policy_number: policy.policy_number,
      min_coverage_start_at: policy.expiry_date,
      insured_type: policy.customer_id ? "INDIVIDUAL" : "CORPORATE",
      existing_customer_id: policy.customer_id,
      existing_company_id: policy.company_id,
      class_id: policy.product_variant.insurance_class.id,
      class_name: policy.product_variant.insurance_class.class_name,
      product_variant_id: policy.product_variant_id,
      insured_address: insuredAddressRow ? toAddressPrefill(insuredAddressRow.address_id) : null,
      risk_address: riskAddressRow ? toAddressPrefill(riskAddressRow.address_id) : null,
      vehicles: vehicles.map((v) => ({
        existing_vehicle_id: v.id,
        plate_number: v.plate_number,
        mv_file_no: v.mv_file_no,
        engine_number: v.engine_number,
        chassis_number: v.chassis_number,
        make: v.make || "",
        model: v.model || "",
        year_model: v.year_model ?? "",
        vehicle_type: v.vehicle_type || "",
        color: v.color || "",
        no_of_seats: v.no_of_seats ?? "",
        estimated_value: v.estimated_value ?? "",
        initial_assessment_date: v.initial_assessment_date,
      })),
      coverage_period_days: coveragePeriodDays,
      coverages: policy.coverages.map((c) => ({
        coverage_id: c.coverage_id,
        coverage_amount: c.coverage_amount,
        premium_amount: c.premium_amount,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.policyDetailSelect = policyDetailSelect;
module.exports.toPolicyPdfProps = toPolicyPdfProps;
