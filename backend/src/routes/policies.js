const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateQuery, validateParams } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const { listPoliciesQuerySchema, policyIdParamSchema, listClientsQuerySchema } = require("../schemas/policies");
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
  minimum_deductible_amount_snapshot: true,
  renewed_policy_number_snapshot: true,
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
  product_variant_id: true,
  policy_status: true,
  cancelled_at: true,
  vehicles: {
    select: {
      id: true,
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
      // Live, not a snapshot — a VEHICLE_ESTIMATED_VALUE endorsement's own
      // "current value" placeholder (routes/endorsements.js's
      // toPolicyContext/priceVehicleValueChange) needs whatever this vehicle
      // is actually assessed at right now, same as no other field here.
      vehicle: { select: { estimated_value: true } },
    },
  },
  addresses: {
    select: { role: true, address_id: true, formatted_address_snapshot: true },
  },
  // removed_at: null — a REMOVE_CLAUSE endorsement soft-deletes its target
  // PolicyCoverage row (see EndorsementChangeType's own comment) rather than
  // hard-deleting it, so every read of "this policy's current coverages" has
  // to filter it back out here, the one place that select is shared from.
  coverages: {
    where: { removed_at: null },
    select: {
      id: true,
      coverage_id: true,
      coverage_name_snapshot: true,
      clause_snapshot: true,
      pricing_mode_snapshot: true,
      coverage_amount: true,
      premium_amount: true,
      payable_to_bethel: true,
      applied_rate: true,
      is_misc_snapshot: true,
      policy_vehicle_id: true,
    },
  },
  // Only ever APPROVED endorsements are folded into a read of this policy —
  // see applyEndorsementsToPolicyDetail below. A SUBMITTED/REJECTED one has
  // no bearing on how this policy itself reads; it's only ever visible
  // through routes/endorsements.js's own endpoints.
  endorsement_requests: {
    where: { status: "APPROVED" },
    orderBy: { sequence_no: "asc" },
    select: {
      id: true,
      endorsement_number: true,
      sequence_no: true,
      effective_date: true,
      updated_at: true,
      changes: {
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          change_type: true,
          change_from: true,
          change_to: true,
          remarks: true,
          policy_vehicle_id: true,
          policy_coverage_id: true,
        },
      },
    },
  },
};

// Which PolicyVehicle snapshot column each VEHICLE_* EndorsementChangeType
// corrects — mirrors routes/policyApproval.js's own VEHICLE_FIELD_BY_CHANGE_TYPE,
// just against this table's *_snapshot column names.
const VEHICLE_FIELD_BY_ENDORSEMENT_CHANGE_TYPE = {
  VEHICLE_MODEL: "model_snapshot",
  VEHICLE_MV_FILE: "mv_file_no_snapshot",
  VEHICLE_PLATE_NO: "plate_number_snapshot",
  VEHICLE_TYPE: "vehicle_type_snapshot",
  VEHICLE_MAKE: "make_snapshot",
  VEHICLE_COLOR: "color_snapshot",
  VEHICLE_ENGINE_NO: "engine_number_snapshot",
  VEHICLE_CHASSIS_NO: "chassis_number_snapshot",
};
const ENDORSEMENT_VEHICLE_CHANGE_TYPES = new Set(Object.keys(VEHICLE_FIELD_BY_ENDORSEMENT_CHANGE_TYPE));
// Only EDIT_CLAUSE folds at read time (a text-only edit, no backing row to
// mutate) — REMOVE_CLAUSE is now a real, permanent PolicyCoverage.removed_at
// mutation applied once at approval (see routes/endorsements.js's
// POST /:id/approve), so a removed coverage simply stops appearing in
// policyDetailSelect's own coverages (filtered by removed_at: null) rather
// than needing a fold override here.
const ENDORSEMENT_CLAUSE_CHANGE_TYPES = new Set(["EDIT_CLAUSE"]);

// Applies one chronological list of already-approved EndorsementChange rows
// on top of a policyDetailSelect-shaped Policy row's own fields — pure, no
// DB access — returning the resolved { effectiveDate, expiryDate,
// customerNameSnapshot, companyNameSnapshot, insuredAddressOverride,
// vehicleOverrides, clauseOverrides }. Shared by applyEndorsementsToPolicyDetail
// below (folds a policy's *entire* endorsement history) and
// routes/endorsements.js (folds only the endorsements already APPROVED as of
// right now, to compute a new/edited change line's own change_from against
// the policy's current, already-endorsed state) — same "period length is
// fixed, a POLICY_EFFECTIVE_DATE change shifts the whole period" rule as
// routes/policyApplications.js's own applyChangesToDetail.
function foldEndorsementChanges(policy, changes) {
  const originalDurationMs = new Date(policy.expiry_date).getTime() - new Date(policy.effective_date).getTime();
  let effectiveDate = policy.effective_date;
  let expiryDate = policy.expiry_date;
  let customerNameSnapshot = policy.customer_name_snapshot;
  let companyNameSnapshot = policy.company_name_snapshot;
  let insuredAddressOverride = null;
  const vehicleOverrides = new Map();
  const clauseOverrides = new Map();

  for (const c of changes) {
    if (c.change_type === "POLICY_EFFECTIVE_DATE") {
      effectiveDate = new Date(c.change_to);
      expiryDate = new Date(effectiveDate.getTime() + originalDurationMs);
    } else if (c.change_type === "INSURED_NAME_DETAILS") {
      if (policy.customer_id) customerNameSnapshot = c.change_to;
      else companyNameSnapshot = c.change_to;
    } else if (c.change_type === "INSURED_ADDRESS_DETAILS") {
      insuredAddressOverride = c.change_to;
    } else if (ENDORSEMENT_VEHICLE_CHANGE_TYPES.has(c.change_type) && c.policy_vehicle_id) {
      const field = VEHICLE_FIELD_BY_ENDORSEMENT_CHANGE_TYPE[c.change_type];
      const existing = vehicleOverrides.get(c.policy_vehicle_id) || {};
      existing[field] = c.change_to;
      vehicleOverrides.set(c.policy_vehicle_id, existing);
    } else if (ENDORSEMENT_CLAUSE_CHANGE_TYPES.has(c.change_type) && c.policy_coverage_id) {
      clauseOverrides.set(c.policy_coverage_id, c.change_to);
    }
  }

  return { effectiveDate, expiryDate, customerNameSnapshot, companyNameSnapshot, insuredAddressOverride, vehicleOverrides, clauseOverrides };
}

function applyFoldedState(policy, folded) {
  return {
    ...policy,
    customer_name_snapshot: folded.customerNameSnapshot,
    company_name_snapshot: folded.companyNameSnapshot,
    effective_date: folded.effectiveDate,
    expiry_date: folded.expiryDate,
    vehicles: policy.vehicles.map((v) => ({ ...v, ...(folded.vehicleOverrides.get(v.id) || {}) })),
    addresses: policy.addresses.map((a) =>
      a.role === "INSURED" && folded.insuredAddressOverride
        ? { ...a, formatted_address_snapshot: folded.insuredAddressOverride }
        : a
    ),
    coverages: policy.coverages.map((c) => ({
      ...c,
      clause_snapshot: folded.clauseOverrides.get(c.id) ?? c.clause_snapshot,
    })),
  };
}

// Folds every APPROVED endorsement recorded against this policy on top of
// its own frozen record — never writes to the Policy/PolicyVehicle/
// PolicyAddress/PolicyCoverage rows themselves (see EndorsementChange's own
// note in endorsements.prisma), just the read-time view every GET/PDF/
// resend-email route below builds its response from. `policy` must be
// fetched with policyDetailSelect (endorsement_requests already scoped to
// APPROVED, ordered oldest-first, each with its own ordered `changes`).
// Also attaches `endorsements` — one entry per approved endorsement, each
// carrying the effective/expiry dates and change descriptions *as of that
// endorsement* (computed incrementally, not the final folded state), plus
// vehicle_label/coverage_label resolved off this policy's own original
// snapshot rows — everything pdf/policyPdf.js needs to append one endorsement
// page per approved request right after the main schedule, with no DB
// lookups of its own (see toPolicyPdfProps below).
function applyEndorsementsToPolicyDetail(policy) {
  const approvedEndorsements = policy.endorsement_requests || [];
  const allChanges = approvedEndorsements.flatMap((e) => e.changes);
  const folded = foldEndorsementChanges(policy, allChanges);

  const vehicleLabelById = new Map(policy.vehicles.map((v) => [v.id, v.plate_number_snapshot || v.mv_file_no_snapshot]));
  const coverageLabelById = new Map(policy.coverages.map((c) => [c.id, c.coverage_name_snapshot]));

  let runningChanges = [];
  const endorsements = approvedEndorsements.map((e) => {
    runningChanges = runningChanges.concat(e.changes);
    const stateAsOfThis = foldEndorsementChanges(policy, runningChanges);
    return {
      endorsementNumber: e.endorsement_number,
      dateIssued: e.updated_at,
      effectiveDate: e.effective_date,
      expiryDate: stateAsOfThis.expiryDate,
      changes: e.changes.map((c) => ({
        change_type: c.change_type,
        change_from: c.change_from,
        change_to: c.change_to,
        remarks: c.remarks,
        vehicle_label: c.policy_vehicle_id ? vehicleLabelById.get(c.policy_vehicle_id) : null,
        coverage_label: c.policy_coverage_id ? coverageLabelById.get(c.policy_coverage_id) : null,
      })),
    };
  });

  return { ...applyFoldedState(policy, folded), endorsements };
}

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
    minimumDeductibleAmount: policy.minimum_deductible_amount_snapshot,
    renewingPolicyNumber: policy.renewed_policy_number_snapshot || undefined,
    totalPremium: policy.total_premium,
    docStamps: policy.doc_stamps,
    vat: policy.vat,
    lgt: policy.lgt,
    misc: policy.misc,
    totalAmount:
      Number(policy.total_premium) + Number(policy.doc_stamps) + Number(policy.vat) + Number(policy.lgt) + Number(policy.misc),
    remarks: policy.remarks,
    // Present only once the caller has folded the policy through
    // applyEndorsementsToPolicyDetail above — pdf/policyPdf.js appends one
    // endorsement page per entry, right after the main schedule (and its own
    // clause page, if any), in the same PDF file.
    endorsements: policy.endorsements || [],
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
    const { page, page_size: pageSize, search, policy_status, class_id } = req.query;
    const where = {
      agent_id: agentId,
      ...(policy_status ? { policy_status } : {}),
      ...(class_id ? { product_variant: { insurance_class_id: class_id } } : {}),
      // Matched against the frozen name snapshots (see Policy's own
      // *_name_snapshot columns) rather than a live customer/company join —
      // simpler, and it's what this list actually displays as "Insured".
      ...(search
        ? {
            OR: [
              { policy_number: { contains: search, mode: "insensitive" } },
              { customer_name_snapshot: { contains: search, mode: "insensitive" } },
              { company_name_snapshot: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, policies] = await Promise.all([
      prisma.policy.count({ where }),
      prisma.policy.findMany({
        where,
        // Closest-to-expire first — this is an agent's own renewal worklist as
        // much as a record of what's been issued, so the policy that needs
        // attention soonest belongs at the top rather than whatever was most
        // recently issued.
        orderBy: { expiry_date: "asc" },
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

// The My Clients page's "Clients" tab — every customer/company on file for
// the caller's own agent (via CustomerAgent/CompanyAgent, so a client shows
// up here even before their first policy is issued), each annotated with
// premium production. Mounted here (not a new router) since it's the same
// "an agent's own book" scoping/permission as GET / above, just grouped by
// party instead of by policy. Registered before GET /:id so Express doesn't
// try to parse "clients" as a policy id.
router.get("/clients", validateQuery(listClientsQuerySchema), async (req, res, next) => {
  try {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "No agent is linked to this account" });
    }
    const { page, page_size: pageSize, search, type } = req.query;

    const [customerLinks, companyLinks] = await Promise.all([
      type === "CORPORATE"
        ? []
        : prisma.customerAgent.findMany({
            where: { agent_id: agentId },
            select: {
              customer: {
                select: { id: true, first_name: true, last_name: true, email: true, mobile_number: true },
              },
            },
          }),
      type === "INDIVIDUAL"
        ? []
        : prisma.companyAgent.findMany({
            where: { agent_id: agentId },
            select: {
              company: { select: { id: true, company_name: true, email: true, tin_no: true } },
            },
          }),
    ]);

    // Premium production only ever counts policies this agent themselves
    // issued for that client (see CLAUDE.md's own note on ClientPolicies.jsx
    // — a client can be on file for more than one agent, but each agent only
    // ever sees the policies *they* issued), so both aggregates below are
    // scoped to agent_id the same way GET / is.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [premium30, allTimeStats] = await Promise.all([
      prisma.policy.groupBy({
        by: ["customer_id", "company_id"],
        where: { agent_id: agentId, issue_date: { gte: thirtyDaysAgo } },
        _sum: { total_premium: true },
      }),
      prisma.policy.groupBy({
        by: ["customer_id", "company_id"],
        where: { agent_id: agentId },
        _count: { id: true },
        _max: { issue_date: true },
      }),
    ]);
    const premiumByClientId = new Map();
    for (const row of premium30) {
      premiumByClientId.set(row.customer_id || row.company_id, Number(row._sum.total_premium || 0));
    }
    const statsByClientId = new Map();
    for (const row of allTimeStats) {
      statsByClientId.set(row.customer_id || row.company_id, {
        totalPolicies: row._count.id,
        lastPolicyDate: row._max.issue_date,
      });
    }

    let clients = [
      ...customerLinks.map(({ customer: c }) => ({
        id: c.id,
        type: "INDIVIDUAL",
        name: [c.last_name, c.first_name].filter(Boolean).join(", "),
        email: c.email,
        contact: c.mobile_number || null,
      })),
      ...companyLinks.map(({ company: c }) => ({
        id: c.id,
        type: "CORPORATE",
        name: c.company_name,
        email: c.email,
        contact: c.tin_no || null,
      })),
    ];

    if (search) {
      const needle = search.toLowerCase();
      clients = clients.filter(
        (c) => c.name.toLowerCase().includes(needle) || (c.email || "").toLowerCase().includes(needle)
      );
    }

    clients = clients.map((c) => ({
      ...c,
      premiums_last_30_days: premiumByClientId.get(c.id) || 0,
      total_policies: statsByClientId.get(c.id)?.totalPolicies || 0,
      last_policy_date: statsByClientId.get(c.id)?.lastPolicyDate || null,
    }));

    // Highest-producing clients first (the whole point of this tab), ties
    // broken alphabetically — computed and sorted in JS rather than at the
    // DB level since a client here is a union of two separate tables with no
    // single query that could rank them together.
    clients.sort((a, b) => b.premiums_last_30_days - a.premiums_last_30_days || a.name.localeCompare(b.name));

    const total = clients.length;
    const paged = clients.slice((page - 1) * pageSize, page * pageSize);

    res.json({ data: paged, total, page, page_size: pageSize });
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
    res.json(toPolicyDetail(applyEndorsementsToPolicyDetail(policy)));
  } catch (err) {
    next(err);
  }
});

// The signed policy PDF — see pdf/policyPdf.js. Built purely from this
// Policy's own frozen snapshot fields (with any APPROVED endorsement already
// folded on top — see applyEndorsementsToPolicyDetail — and each one's own
// amendment page appended right after the main schedule), so it always
// matches exactly what was approved, even if the Vehicle/Agent/
// ProductVariant/ProductCoverage rows it was originally sourced from have
// since changed.
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
    const pdfBuffer = await buildPolicyPdf(toPolicyPdfProps(applyEndorsementsToPolicyDetail(policy)));
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

    const foldedPolicy = applyEndorsementsToPolicyDetail(policy);
    const insuredName = foldedPolicy.customer_name_snapshot || foldedPolicy.company_name_snapshot;
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

    const pdfBuffer = await buildPolicyPdf(toPolicyPdfProps(foldedPolicy));

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
        product_variant_id: v.product_variant_id || "",
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
module.exports.toPolicyDetail = toPolicyDetail;
module.exports.applyEndorsementsToPolicyDetail = applyEndorsementsToPolicyDetail;
module.exports.foldEndorsementChanges = foldEndorsementChanges;
module.exports.applyFoldedState = applyFoldedState;
module.exports.VEHICLE_FIELD_BY_ENDORSEMENT_CHANGE_TYPE = VEHICLE_FIELD_BY_ENDORSEMENT_CHANGE_TYPE;
module.exports.ENDORSEMENT_VEHICLE_CHANGE_TYPES = ENDORSEMENT_VEHICLE_CHANGE_TYPES;
module.exports.ENDORSEMENT_CLAUSE_CHANGE_TYPES = ENDORSEMENT_CLAUSE_CHANGE_TYPES;
