const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody, validateQuery, validateParams } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const { fetchByPriority } = require("../lib/priorityPagination");
const { resolveCoverageRows, computeChargeTotals, round2 } = require("../lib/coveragePricing");
const { currentVehicleValue } = require("../lib/vehicleValue");
const {
  VEHICLE_CHANGE_TYPES,
  COVERAGE_TARGET_CHANGE_TYPES,
  createEndorsementRequestSchema,
  endorsementChangeSchema,
  rejectEndorsementSchema,
  listEndorsementRequestsQuerySchema,
  endorsementIdParamSchema,
  endorsementChangeIdParamSchema,
  policyIdParamSchema,
} = require("../schemas/endorsements");
const {
  policyDetailSelect,
  foldEndorsementChanges,
  applyFoldedState,
  VEHICLE_FIELD_BY_ENDORSEMENT_CHANGE_TYPE,
} = require("./policies");
const { formatAddress } = require("./policyApplications");
const { buildEndorsementPdf } = require("../pdf/endorsementPdf");
const { HttpError, sendIfHttpError } = require("../lib/httpError");
const { sendMail } = require("../lib/mailer");
const { buildEndorsementSubmittedEmailContent, buildEndorsementApprovedEmailContent } = require("../lib/endorsementEmails");

const router = express.Router();

// requireAuth only at router level, same reasoning as companies.js/
// policyQuotations.js — different routes below need different grants
// (VIEW_POLICIES.CREATE_ENDORSEMENT for an agent filing one, APPROVE_ENDORSEMENT
// for the approval queue), and a caller holding only one may well lack the other.
router.use(requireAuth);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Every field GET /:id/pdf, POST /:id/resend-email, and the submitted/
// approved email attachments need off one EndorsementRequest row — kept as
// one shape so renderEndorsementPdf below always builds from the exact same
// data, whichever route reached it.
const endorsementPdfSelect = {
  id: true,
  policy_id: true,
  endorsement_number: true,
  sequence_no: true,
  status: true,
  request_type: true,
  effective_date: true,
  created_at: true,
  updated_at: true,
  changes: {
    orderBy: { created_at: "asc" },
    select: {
      change_type: true,
      change_from: true,
      change_to: true,
      remarks: true,
      policy_vehicle_id: true,
      policy_coverage_id: true,
      premium_amount: true,
      is_misc: true,
    },
  },
};

// An approver holding APPROVE_ENDORSEMENT can view/resend any endorsement;
// an agent holding VIEW_POLICIES.CREATE_ENDORSEMENT can only view/resend
// endorsements against their own agent's policies (VIEW_POLICIES itself is
// enough to *view* — the .CREATE_ENDORSEMENT sub-permission only gates
// actually filing one, same "page access isn't write access" split as
// CREATE_APPLICATION/.AGENT_ISSUANCE). Returns { agentId: null } for the
// any-policy tier, { agentId } for the own-policy tier, or null (having
// already written the 403/400 response) on failure — every caller does
// `if (!access) return;` right after.
async function resolveViewAccess(req, res) {
  const codes = await getUserPermissionCodes(req.user.userId);
  if (codes.has("APPROVE_ENDORSEMENT")) {
    return { agentId: null };
  }
  if (codes.has("VIEW_POLICIES")) {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      res.status(400).json({ error: "Your account isn't linked to an agent profile" });
      return null;
    }
    return { agentId };
  }
  res.status(403).json({ error: "Missing required permission: VIEW_POLICIES or APPROVE_ENDORSEMENT" });
  return null;
}

// Rejects a "correction" whose new value is identical to what's already on
// file — same reasoning/behavior as routes/policyApproval.js's own
// assertActuallyChanged.
function assertActuallyChanged(changeFrom, changeTo) {
  if (changeFrom === null || changeFrom === undefined) return;
  const fromStr = String(changeFrom).trim();
  const toStr = changeTo === null || changeTo === undefined ? "" : String(changeTo).trim();
  if (fromStr === toStr) {
    throw new HttpError(400, "The new value is the same as the current value on file — nothing to change");
  }
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Prices a brand-new PolicyCoverage line for an ADD_COVERAGE change, through
// the exact same lib/coveragePricing.js engine an application/quotation uses
// — one coverage, targeting at most one of this policy's own vehicles
// (policy_vehicle_id), priced at the policy's own CURRENT coverage period
// (baseline.effective_date/expiry_date, already folded through any earlier
// POLICY_EFFECTIVE_DATE line in this same batch). A Motor policy always needs
// a target vehicle here — unlike an application's own "applies to all
// vehicles" coverage selection, one EndorsementChange always becomes exactly
// one PolicyCoverage row, so the agent adds one ADD_COVERAGE line per vehicle
// it should apply to rather than an implicit fan-out.
async function priceAddCoverageChange(policy, baseline, input) {
  const productCoverage = await prisma.productCoverage.findUnique({
    where: { id: input.product_coverage_id },
    select: { id: true, coverage_name: true },
  });
  if (!productCoverage) {
    throw new HttpError(400, "product_coverage_id does not exist");
  }

  const isMotor = policy.class_name_snapshot === "Motor";
  if (isMotor && !input.policy_vehicle_id) {
    throw new HttpError(400, "policy_vehicle_id is required to add a coverage on a Motor policy");
  }
  if (!isMotor && input.policy_vehicle_id) {
    throw new HttpError(400, "policy_vehicle_id is not applicable — this policy has no vehicles");
  }

  let vehicles = [];
  let vehicleValues = [];
  let vehicleIndices = null;
  if (input.policy_vehicle_id) {
    const policyVehicle = await prisma.policyVehicle.findFirst({
      where: { id: input.policy_vehicle_id, policy_id: baseline.id },
      select: {
        no_of_seats_snapshot: true,
        vehicle: { select: { estimated_value: true, initial_assessment_date: true } },
      },
    });
    if (!policyVehicle) {
      throw new HttpError(400, "policy_vehicle_id does not belong to this policy");
    }
    vehicles = [{ no_of_seats: policyVehicle.no_of_seats_snapshot }];
    vehicleValues = [
      currentVehicleValue(policyVehicle.vehicle.estimated_value, policyVehicle.vehicle.initial_assessment_date),
    ];
    vehicleIndices = [0];
  }

  let addressValue = null;
  if (!isMotor) {
    const riskAddress = await prisma.policyAddress.findFirst({
      where: { policy_id: baseline.id, role: "RISK" },
      select: { address: { select: { estimated_value: true } } },
    });
    addressValue = riskAddress?.address?.estimated_value ?? null;
  }

  const resolvedRows = await resolveCoverageRows({
    coverages: [
      {
        coverage_id: input.product_coverage_id,
        vehicle_indices: vehicleIndices,
        coverage_amount: input.coverage_amount,
        premium_amount: input.premium_amount,
      },
    ],
    className: policy.class_name_snapshot,
    vehicles,
    vehicleValues,
    addressValue,
    agentId: policy.agent_id,
    startAt: new Date(baseline.effective_date),
    endAt: new Date(baseline.expiry_date),
  });
  const row = resolvedRows[0];

  return {
    policy_vehicle_id: input.policy_vehicle_id || null,
    policy_coverage_id: null,
    change_type: "ADD_COVERAGE",
    change_from: null,
    change_to: `Add coverage: ${productCoverage.coverage_name} — Coverage Amount ₱${formatMoney(row.coverage_amount)}, Premium ₱${formatMoney(row.premium_amount)}`,
    remarks: input.remarks || null,
    product_coverage_id: input.product_coverage_id,
    coverage_amount: row.coverage_amount,
    premium_amount: row.premium_amount,
    payable_to_bethel: row.payable_to_bethel,
    applied_rate: row.applied_rate,
    is_misc: row.is_misc,
  };
}

// Resolves one endorsementChangeSchema-validated line into the shape
// EndorsementChange.createMany/create/update expects, against `baseline` — a
// policyDetailSelect-shaped Policy row already folded (via
// foldEndorsementChanges/applyFoldedState) through every change that should
// count as "current" for this line's own diff. change_from is always
// computed here, never trusted from the client. `policy` is the raw
// (unfolded) policyDetailSelect row — ADD_COVERAGE needs its agent_id/
// class_name_snapshot, which folding never touches.
async function resolveEndorsementChange(baseline, input, policy) {
  const { change_type, policy_vehicle_id, policy_coverage_id, new_value, new_address, remarks } = input;
  let changeFrom = null;
  let changeTo = new_value ?? null;

  if (change_type === "ADD_COVERAGE") {
    return priceAddCoverageChange(policy, baseline, input);
  }

  if (change_type === "REMOVE_CLAUSE") {
    const coverage = baseline.coverages.find((c) => c.id === policy_coverage_id);
    if (!coverage) {
      throw new HttpError(400, "policy_coverage_id does not belong to this policy");
    }
    return {
      policy_vehicle_id: null,
      policy_coverage_id,
      change_type,
      change_from: `${coverage.coverage_name_snapshot} — Coverage Amount ₱${formatMoney(coverage.coverage_amount)}, Premium ₱${formatMoney(coverage.premium_amount)}`,
      change_to: "Coverage removed",
      remarks: remarks || null,
      product_coverage_id: null,
      // Frozen off the targeted PolicyCoverage row right now, at filing time
      // — see EndorsementChange's own schema comment on why this is
      // decoupled from a live re-read at approval.
      coverage_amount: coverage.coverage_amount,
      premium_amount: coverage.premium_amount,
      payable_to_bethel: coverage.payable_to_bethel,
      applied_rate: coverage.applied_rate,
      is_misc: coverage.is_misc_snapshot,
    };
  }

  if (VEHICLE_CHANGE_TYPES.has(change_type)) {
    const vehicle = baseline.vehicles.find((v) => v.id === policy_vehicle_id);
    if (!vehicle) {
      throw new HttpError(400, "policy_vehicle_id does not belong to this policy");
    }
    const field = VEHICLE_FIELD_BY_ENDORSEMENT_CHANGE_TYPE[change_type];
    changeFrom = vehicle[field] ?? null;
    assertActuallyChanged(changeFrom, changeTo);
  } else if (change_type === "INSURED_ADDRESS_DETAILS") {
    const insured = baseline.addresses.find((a) => a.role === "INSURED");
    if (!insured) {
      throw new HttpError(400, "This policy has no insured address to change");
    }
    changeFrom = insured.formatted_address_snapshot;
    changeTo = formatAddress(new_address);
    assertActuallyChanged(changeFrom, changeTo);
  } else if (change_type === "POLICY_EFFECTIVE_DATE") {
    changeFrom = new Date(baseline.effective_date).toISOString();
    changeTo = new Date(new_value).toISOString();
    assertActuallyChanged(changeFrom, changeTo);
  } else if (change_type === "INSURED_NAME_DETAILS") {
    changeFrom = baseline.customer_name_snapshot || baseline.company_name_snapshot;
    assertActuallyChanged(changeFrom, changeTo);
  } else if (change_type === "EDIT_CLAUSE") {
    const coverage = baseline.coverages.find((c) => c.id === policy_coverage_id);
    if (!coverage) {
      throw new HttpError(400, "policy_coverage_id does not belong to this policy");
    }
    changeFrom = coverage.clause_snapshot || "";
    changeTo = new_value;
    assertActuallyChanged(changeFrom, changeTo);
  }

  return {
    policy_vehicle_id: VEHICLE_CHANGE_TYPES.has(change_type) ? policy_vehicle_id : null,
    policy_coverage_id: change_type === "EDIT_CLAUSE" ? policy_coverage_id : null,
    change_type,
    change_from: changeFrom,
    change_to: changeTo,
    remarks: remarks || null,
    product_coverage_id: null,
    coverage_amount: null,
    premium_amount: null,
    payable_to_bethel: null,
    applied_rate: null,
    is_misc: null,
  };
}

// Resolves a whole batch of change inputs in order, each one diffed against
// the policy's state *after* every earlier line in this same batch has been
// tentatively applied on top of `priorApprovedChanges` — so two lines in one
// endorsement that touch the same field chain correctly instead of both
// diffing against the original snapshot. ADD_COVERAGE/REMOVE_CLAUSE don't
// participate in that folding chain themselves (they don't change any field
// foldEndorsementChanges tracks), but still flow through the same loop so a
// batch can freely mix financial and correction lines. Used by POST /
// (create), POST /preview-pdf (draft), and POST /:id/changes (approver adds
// one more — called with a single-item array).
async function resolveEndorsementChangeBatch(policy, priorApprovedChanges, changeInputs) {
  const resolved = [];
  for (const input of changeInputs) {
    const baseline = applyFoldedState(policy, foldEndorsementChanges(policy, [...priorApprovedChanges, ...resolved]));
    resolved.push(await resolveEndorsementChange(baseline, input, policy));
  }
  return resolved;
}

// The "what does this policy currently look like" shape both GET /:id (an
// existing endorsement's own reference view) and GET
// /policy/:policyId/context (the create-side composer's reference view,
// before any endorsement of its own exists yet) return — every already-
// approved endorsement folded in, exposing each vehicle/coverage's current
// field values so the composer can show "current value" placeholders
// without the client re-deriving them itself. `availableCoverages` is the
// policy's own product variant's full coverage catalog — the ADD_COVERAGE
// picker's options, resolved by the caller (needs a DB lookup this function
// itself doesn't do).
function toPolicyContext(policy, foldedPolicy, availableCoverages) {
  const insuredAddress = foldedPolicy.addresses.find((a) => a.role === "INSURED");
  return {
    policy_number: policy.policy_number,
    policy_status: policy.policy_status,
    class_name: policy.class_name_snapshot,
    variant_name: policy.variant_name_snapshot,
    insured_type: policy.customer_id ? "INDIVIDUAL" : "CORPORATE",
    insured_name: foldedPolicy.customer_name_snapshot || foldedPolicy.company_name_snapshot,
    insured_address: insuredAddress ? insuredAddress.formatted_address_snapshot : null,
    vehicles: foldedPolicy.vehicles.map((v) => ({
      id: v.id,
      label: v.plate_number_snapshot || v.mv_file_no_snapshot,
      model: v.model_snapshot,
      mv_file_no: v.mv_file_no_snapshot,
      plate_number: v.plate_number_snapshot,
      vehicle_type: v.vehicle_type_snapshot,
      make: v.make_snapshot,
      color: v.color_snapshot,
      engine_number: v.engine_number_snapshot,
      chassis_number: v.chassis_number_snapshot,
    })),
    coverages: foldedPolicy.coverages.map((c) => ({
      id: c.id,
      name: c.coverage_name_snapshot,
      clause: c.clause_snapshot,
      coverage_amount: c.coverage_amount,
      premium_amount: c.premium_amount,
      policy_vehicle_id: c.policy_vehicle_id,
    })),
    available_coverages: availableCoverages || [],
    current_effective_date: foldedPolicy.effective_date,
    current_expiry_date: foldedPolicy.expiry_date,
  };
}

// Attaches a human-readable vehicle_label/coverage_label (plate number /
// coverage name) onto each change row, resolved off `policy`'s own
// vehicles/coverages — pdf/endorsementPdf.js's describeChange() and the
// frontend's own change-history table both read these instead of doing
// their own id lookups.
function attachChangeLabels(policy, changes) {
  const vehicleLabelById = new Map(policy.vehicles.map((v) => [v.id, v.plate_number_snapshot || v.mv_file_no_snapshot]));
  const coverageLabelById = new Map(policy.coverages.map((c) => [c.id, c.coverage_name_snapshot]));
  return changes.map((c) => ({
    ...c,
    vehicle_label: c.policy_vehicle_id ? vehicleLabelById.get(c.policy_vehicle_id) : null,
    coverage_label: c.policy_coverage_id ? coverageLabelById.get(c.policy_coverage_id) : null,
  }));
}

// The pricing CHANGE this endorsement's own financial lines introduce —
// ADD_COVERAGE contributes its premium_amount positively, REMOVE_CLAUSE
// contributes the removed line's own premium_amount negatively (a refund) —
// run through the same total_premium/doc_stamps/vat/lgt/misc split
// computeChargeTotals uses elsewhere, then totalled. Every other change type
// contributes nothing (no premium/coverage-amount effect at all — see
// EndorsementChangeType's own comment). CANCEL_POLICY is deliberately not
// represented here either — a cancellation's own payable effect is a ledger
// debit, not a premium/coverage change on this document.
function computeEndorsementChargeDelta(changes) {
  const rows = [];
  for (const c of changes) {
    if (c.change_type === "ADD_COVERAGE" && c.premium_amount != null) {
      rows.push({ premium_amount: Number(c.premium_amount), is_misc: Boolean(c.is_misc) });
    } else if (c.change_type === "REMOVE_CLAUSE" && c.premium_amount != null) {
      rows.push({ premium_amount: -Number(c.premium_amount), is_misc: Boolean(c.is_misc) });
    }
  }
  if (!rows.length) {
    return { totalPremium: 0, docStamps: 0, vat: 0, lgt: 0, misc: 0, totalAmount: 0 };
  }
  const { totalPremium, docStamps, vat, lgt, misc } = computeChargeTotals(rows, 0);
  return { totalPremium, docStamps, vat, lgt, misc, totalAmount: round2(totalPremium + docStamps + vat + lgt + misc) };
}

// The agent's commission earned on this policy so far (every ISSUANCE/
// ENDORSEMENT credit ever posted against it — a REMOVE_CLAUSE's own
// ENDORSEMENT debit already nets out of this the moment it's posted, so this
// always reflects the *current*, not original, commission), and the
// day-prorated portion of it a CANCEL_POLICY endorsement's approval hands
// back — see EndorsementChangeType.CANCEL_POLICY's own comment for why this
// is computed fresh at approval time rather than at filing.
function computeCancellationProration({ basisAmount, effectiveDate, expiryDate, cancellationDate }) {
  const totalDays = Math.max(0, Math.round((new Date(expiryDate).getTime() - new Date(effectiveDate).getTime()) / MS_PER_DAY));
  const rawElapsed = Math.round((new Date(cancellationDate).getTime() - new Date(effectiveDate).getTime()) / MS_PER_DAY);
  const elapsedDays = Math.min(totalDays, Math.max(0, rawElapsed));
  const remainingDays = totalDays - elapsedDays;
  const dailyRate = totalDays > 0 ? basisAmount / totalDays : 0;
  const deduction = round2(dailyRate * remainingDays);
  const description =
    `Policy cancellation proration: ${totalDays}-day term, ${elapsedDays} day(s) used, ${remainingDays} day(s) unused ` +
    `at ₱${formatMoney(dailyRate)}/day (total commission earned to date: ₱${formatMoney(basisAmount)}) ` +
    `→ payable deduction ₱${formatMoney(deduction)}. Cancellation effective ${new Date(cancellationDate).toISOString().slice(0, 10)}.`;
  return { totalDays, elapsedDays, remainingDays, dailyRate, deduction, description };
}

// Renders one saved EndorsementRequest (`endorsement`, endorsementPdfSelect-
// shaped) as a PDF Buffer — shared by GET /:id/pdf, POST /:id/resend-email,
// and the submitted/approved email attachments, so all four can never
// disagree. `policy` is policyDetailSelect-shaped (its own
// endorsement_requests already scoped to APPROVED only, ordered by
// sequence_no). The header/insured fields reflect the policy's state right
// *before* this endorsement's own changes (every approved endorsement with a
// lower sequence_no, folded) — for an already-APPROVED endorsement with nothing
// approved after it, "before + its own changes" and "the policy's current
// state" are the same thing; for a still-SUBMITTED one, its own changes are
// only tentatively layered on top to compute the "...and expires..." line, not
// actually part of the approved fold yet.
async function renderEndorsementPdf(endorsement, policy) {
  const priorApproved = (policy.endorsement_requests || [])
    .filter((e) => e.sequence_no < endorsement.sequence_no)
    .flatMap((e) => e.changes);
  const baseline = applyFoldedState(policy, foldEndorsementChanges(policy, priorApproved));
  const withThis = foldEndorsementChanges(policy, [...priorApproved, ...endorsement.changes]);
  const insuredAddress = baseline.addresses.find((a) => a.role === "INSURED");
  const stampText =
    endorsement.status === "SUBMITTED"
      ? "ENDORSEMENT PENDING APPROVAL"
      : endorsement.status === "REJECTED"
      ? "ENDORSEMENT REJECTED"
      : null;
  const delta = computeEndorsementChargeDelta(endorsement.changes);

  return buildEndorsementPdf({
    endorsementNumber: endorsement.endorsement_number,
    policyNumber: policy.policy_number,
    classNameLabel: policy.class_name_snapshot,
    variantName: policy.variant_name_snapshot,
    insuredName: baseline.customer_name_snapshot || baseline.company_name_snapshot,
    insuredAddress: insuredAddress ? insuredAddress.formatted_address_snapshot : null,
    agentCode: policy.agent_code_snapshot,
    dateIssued: endorsement.status === "APPROVED" ? endorsement.updated_at : endorsement.created_at,
    effectiveDate: endorsement.effective_date,
    expiryDate: withThis.expiryDate,
    totalPremium: delta.totalPremium,
    docStamps: delta.docStamps,
    vat: delta.vat,
    lgt: delta.lgt,
    misc: delta.misc,
    totalAmount: delta.totalAmount,
    changes: attachChangeLabels(policy, endorsement.changes),
    stampText,
    signed: endorsement.status === "APPROVED",
  });
}

// The approval queue — every endorsement request in the system, from every
// agent. Same priority-sort as routes/policyApproval.js's own GET / (see that
// route's own note and lib/priorityPagination.js): a still-`SUBMITTED`
// request always outranks an already-decided one, oldest-filed-first within
// the pending bucket, newest-decided-first within the decided one.
const DECIDED_ENDORSEMENT_STATUSES = ["APPROVED", "REJECTED"];

router.get("/", requirePermission("APPROVE_ENDORSEMENT"), validateQuery(listEndorsementRequestsQuerySchema), async (req, res, next) => {
  try {
    const { page, page_size: pageSize, search, status, request_type } = req.query;
    const where = {
      ...(status ? { status } : {}),
      ...(request_type ? { request_type } : {}),
      ...(search
        ? {
            OR: [
              { endorsement_number: { contains: search, mode: "insensitive" } },
              { policy: { policy_number: { contains: search, mode: "insensitive" } } },
              { policy: { customer_name_snapshot: { contains: search, mode: "insensitive" } } },
              { policy: { company_name_snapshot: { contains: search, mode: "insensitive" } } },
              { policy: { agent: { agent_code: { contains: search, mode: "insensitive" } } } },
              { policy: { agent: { agent_name: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const endorsementSelect = {
      id: true,
      endorsement_number: true,
      status: true,
      request_type: true,
      effective_date: true,
      created_at: true,
      policy: {
        select: {
          policy_number: true,
          customer_name_snapshot: true,
          company_name_snapshot: true,
          class_name_snapshot: true,
          variant_name_snapshot: true,
          agent: { select: { agent_code: true, agent_name: true } },
        },
      },
    };

    const [total, rows] = await Promise.all([
      prisma.endorsementRequest.count({ where }),
      fetchByPriority({
        delegate: prisma.endorsementRequest,
        pendingWhere: { AND: [where, { status: { notIn: DECIDED_ENDORSEMENT_STATUSES } }] },
        decidedWhere: { AND: [where, { status: { in: DECIDED_ENDORSEMENT_STATUSES } }] },
        pendingOrderBy: { created_at: "asc" },
        decidedOrderBy: { created_at: "desc" },
        select: endorsementSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        endorsement_number: r.endorsement_number,
        status: r.status,
        request_type: r.request_type,
        effective_date: r.effective_date,
        created_at: r.created_at,
        policy_number: r.policy.policy_number,
        insured_name: r.policy.customer_name_snapshot || r.policy.company_name_snapshot,
        class_name: r.policy.class_name_snapshot,
        variant_name: r.policy.variant_name_snapshot,
        agent_code: r.policy.agent.agent_code,
        agent_name: r.policy.agent.agent_name,
      })),
      total,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    next(err);
  }
});

// One policy's own endorsement history, every status, oldest first — the
// Client Policies page's own two-pane dialog's "Endorsement History" list.
router.get(
  "/policy/:policyId",
  requirePermission("VIEW_POLICIES"),
  validateParams(policyIdParamSchema),
  async (req, res, next) => {
    try {
      const agentId = await getCurrentAgentId(req.user.userId);
      if (!agentId) {
        return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
      }
      const policy = await prisma.policy.findFirst({ where: { id: req.params.policyId, agent_id: agentId }, select: { id: true } });
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }

      const rows = await prisma.endorsementRequest.findMany({
        where: { policy_id: req.params.policyId },
        orderBy: { sequence_no: "asc" },
        select: {
          id: true,
          endorsement_number: true,
          sequence_no: true,
          status: true,
          request_type: true,
          effective_date: true,
          created_at: true,
          updated_at: true,
          created_by_user: { select: { full_name: true, email: true } },
          changes: { select: { id: true } },
        },
      });

      res.json(
        rows.map((r) => ({
          id: r.id,
          endorsement_number: r.endorsement_number,
          sequence_no: r.sequence_no,
          status: r.status,
          request_type: r.request_type,
          effective_date: r.effective_date,
          created_at: r.created_at,
          updated_at: r.updated_at,
          created_by_name: r.created_by_user.full_name || r.created_by_user.email,
          change_count: r.changes.length,
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

// The policy's current (every already-approved endorsement folded in) state
// — the Client Policies page's "Create Endorsement Request" composer's own
// reference view, fetched before any endorsement of its own exists yet (an
// existing one instead gets this same shape back from GET /:id above).
router.get(
  "/policy/:policyId/context",
  requirePermission("VIEW_POLICIES.CREATE_ENDORSEMENT"),
  validateParams(policyIdParamSchema),
  async (req, res, next) => {
    try {
      const agentId = await getCurrentAgentId(req.user.userId);
      if (!agentId) {
        return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
      }
      const policy = await prisma.policy.findFirst({
        where: { id: req.params.policyId, agent_id: agentId },
        select: policyDetailSelect,
      });
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }

      const priorApprovedChanges = (policy.endorsement_requests || []).flatMap((e) => e.changes);
      const foldedPolicy = applyFoldedState(policy, foldEndorsementChanges(policy, priorApprovedChanges));
      const availableCoverages = await prisma.productCoverage.findMany({
        where: { product_variant_id: policy.product_variant_id, status: "ACTIVE" },
        select: { id: true, coverage_name: true, pricing_mode: true },
        orderBy: { coverage_name: "asc" },
      });
      res.json(toPolicyContext(policy, foldedPolicy, availableCoverages));
    } catch (err) {
      next(err);
    }
  }
);

// Files a new endorsement request — the Client Policies page's "Create
// Endorsement Request" panel. An agent can only endorse their own policies;
// every proposed change is resolved (change_from computed, never trusted
// from the client) and saved together with the header row in one
// transaction. endorsement_number is "<policy_number>-E<sequence_no>",
// sequence_no counted per policy. A CANCELLATION request carries no
// client-submitted changes at all — the server synthesizes the single
// CANCEL_POLICY line itself (its actual payable effect is computed fresh at
// approval, not here — see POST /:id/approve).
router.post(
  "/",
  requirePermission("VIEW_POLICIES.CREATE_ENDORSEMENT"),
  validateBody(createEndorsementRequestSchema),
  async (req, res, next) => {
    try {
      const agentId = await getCurrentAgentId(req.user.userId);
      if (!agentId) {
        return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
      }

      const { policy_id, request_type, effective_date, remarks, send_policy_to_email, send_policy_to_email_on_approval, changes } =
        req.body;

      const policy = await prisma.policy.findFirst({ where: { id: policy_id, agent_id: agentId }, select: policyDetailSelect });
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }
      if (policy.policy_status === "CANCELLED") {
        return res.status(400).json({ error: "This policy has been cancelled and cannot be endorsed" });
      }

      let resolvedChanges;
      if (request_type === "CANCELLATION") {
        resolvedChanges = [
          {
            policy_vehicle_id: null,
            policy_coverage_id: null,
            change_type: "CANCEL_POLICY",
            change_from: policy.policy_status,
            change_to: "CANCELLED",
            remarks,
            product_coverage_id: null,
            coverage_amount: null,
            premium_amount: null,
            payable_to_bethel: null,
            applied_rate: null,
            is_misc: null,
          },
        ];
      } else {
        const priorApprovedChanges = (policy.endorsement_requests || []).flatMap((e) => e.changes);
        resolvedChanges = await resolveEndorsementChangeBatch(policy, priorApprovedChanges, changes);
      }

      const created = await prisma.$transaction(async (tx) => {
        const existingCount = await tx.endorsementRequest.count({ where: { policy_id } });
        const sequenceNo = existingCount + 1;

        const endorsement = await tx.endorsementRequest.create({
          data: {
            policy_id,
            endorsement_number: `${policy.policy_number}-E${sequenceNo}`,
            sequence_no: sequenceNo,
            request_type,
            effective_date,
            remarks: remarks || null,
            send_policy_to_email,
            send_policy_to_email_on_approval,
            created_by_agent_id: agentId,
            created_by_user_id: req.user.userId,
          },
        });

        await tx.endorsementChange.createMany({
          data: resolvedChanges.map((c) => ({ ...c, endorsement_request_id: endorsement.id })),
        });

        return endorsement;
      });

      if (send_policy_to_email) {
        try {
          const insuredEmail = policy.customer?.email || policy.company?.email;
          if (insuredEmail) {
            const fullEndorsement = await prisma.endorsementRequest.findUnique({
              where: { id: created.id },
              select: endorsementPdfSelect,
            });
            const pdfBuffer = await renderEndorsementPdf(fullEndorsement, policy);
            const insuredName = policy.customer_name_snapshot || policy.company_name_snapshot;
            const { subject, html, text } = buildEndorsementSubmittedEmailContent({
              insuredName,
              policyNumber: policy.policy_number,
              endorsementNumber: created.endorsement_number,
            });
            await sendMail({
              to: insuredEmail,
              subject,
              html,
              text,
              attachments: [{ filename: `${created.endorsement_number}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
            });
          }
        } catch (mailErr) {
          console.error("[endorsements] failed to send submission email", mailErr);
        }
      }

      res.status(201).json({ id: created.id, endorsement_number: created.endorsement_number });
    } catch (err) {
      if (sendIfHttpError(err, res)) return;
      next(err);
    }
  }
);

// Read-only render of a not-yet-saved batch of changes — the Client
// Policies page's "Preview changes" action, required before "Confirm and
// submit" (same gate every other create flow in this app uses).
router.post(
  "/preview-pdf",
  requirePermission("VIEW_POLICIES.CREATE_ENDORSEMENT"),
  validateBody(createEndorsementRequestSchema),
  async (req, res, next) => {
    try {
      const agentId = await getCurrentAgentId(req.user.userId);
      if (!agentId) {
        return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
      }

      const { policy_id, request_type, effective_date, remarks, changes } = req.body;
      const policy = await prisma.policy.findFirst({ where: { id: policy_id, agent_id: agentId }, select: policyDetailSelect });
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }

      const priorApprovedChanges = (policy.endorsement_requests || []).flatMap((e) => e.changes);
      let resolvedChanges;
      if (request_type === "CANCELLATION") {
        resolvedChanges = [
          {
            change_type: "CANCEL_POLICY",
            change_from: policy.policy_status,
            change_to: "CANCELLED",
            remarks,
            policy_vehicle_id: null,
            policy_coverage_id: null,
          },
        ];
      } else {
        resolvedChanges = await resolveEndorsementChangeBatch(policy, priorApprovedChanges, changes);
      }
      const withThis = foldEndorsementChanges(policy, [...priorApprovedChanges, ...resolvedChanges]);
      const baseline = applyFoldedState(policy, foldEndorsementChanges(policy, priorApprovedChanges));
      const insuredAddress = baseline.addresses.find((a) => a.role === "INSURED");
      const delta = computeEndorsementChargeDelta(resolvedChanges);

      const pdfBuffer = await buildEndorsementPdf({
        endorsementNumber: "TO BE ASSIGNED ON SUBMISSION",
        policyNumber: policy.policy_number,
        classNameLabel: policy.class_name_snapshot,
        variantName: policy.variant_name_snapshot,
        insuredName: baseline.customer_name_snapshot || baseline.company_name_snapshot,
        insuredAddress: insuredAddress ? insuredAddress.formatted_address_snapshot : null,
        agentCode: policy.agent_code_snapshot,
        dateIssued: new Date(),
        effectiveDate: effective_date,
        expiryDate: withThis.expiryDate,
        totalPremium: delta.totalPremium,
        docStamps: delta.docStamps,
        vat: delta.vat,
        lgt: delta.lgt,
        misc: delta.misc,
        totalAmount: delta.totalAmount,
        changes: attachChangeLabels(policy, resolvedChanges),
        stampText: "ENDORSEMENT PENDING APPROVAL",
        signed: false,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="endorsement-preview.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      if (sendIfHttpError(err, res)) return;
      next(err);
    }
  }
);

// Full JSON detail for one endorsement — the create-side dialog's own
// history-row view and the Endorsement Approval review dialog's change
// form/history panel.
router.get("/:id", validateParams(endorsementIdParamSchema), async (req, res, next) => {
  try {
    const access = await resolveViewAccess(req, res);
    if (!access) return;

    const endorsement = await prisma.endorsementRequest.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        endorsement_number: true,
        sequence_no: true,
        status: true,
        request_type: true,
        effective_date: true,
        remarks: true,
        send_policy_to_email: true,
        send_policy_to_email_on_approval: true,
        created_at: true,
        updated_at: true,
        policy_id: true,
        created_by_user: { select: { full_name: true, email: true } },
        policy: { select: { agent_id: true, product_variant_id: true } },
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
            product_coverage_id: true,
            coverage_amount: true,
            premium_amount: true,
            payable_to_bethel: true,
            applied_rate: true,
            is_misc: true,
            created_at: true,
          },
        },
      },
    });
    if (!endorsement) {
      return res.status(404).json({ error: "Endorsement not found" });
    }
    if (access.agentId && endorsement.policy.agent_id !== access.agentId) {
      return res.status(404).json({ error: "Endorsement not found" });
    }

    const policy = await prisma.policy.findUnique({ where: { id: endorsement.policy_id }, select: policyDetailSelect });
    // This endorsement's own changes are excluded from the fold here — its
    // reference view shows the state right *before* itself, same as
    // renderEndorsementPdf's own baseline, not "as if already approved".
    const priorApprovedChanges = (policy.endorsement_requests || []).filter((e) => e.id !== endorsement.id).flatMap((e) => e.changes);
    const foldedPolicy = applyFoldedState(policy, foldEndorsementChanges(policy, priorApprovedChanges));
    const availableCoverages = await prisma.productCoverage.findMany({
      where: { product_variant_id: policy.product_variant_id, status: "ACTIVE" },
      select: { id: true, coverage_name: true, pricing_mode: true },
      orderBy: { coverage_name: "asc" },
    });

    res.json({
      id: endorsement.id,
      endorsement_number: endorsement.endorsement_number,
      sequence_no: endorsement.sequence_no,
      status: endorsement.status,
      request_type: endorsement.request_type,
      effective_date: endorsement.effective_date,
      remarks: endorsement.remarks,
      send_policy_to_email: endorsement.send_policy_to_email,
      send_policy_to_email_on_approval: endorsement.send_policy_to_email_on_approval,
      created_at: endorsement.created_at,
      updated_at: endorsement.updated_at,
      created_by_name: endorsement.created_by_user.full_name || endorsement.created_by_user.email,
      policy_id: endorsement.policy_id,
      ...toPolicyContext(policy, foldedPolicy, availableCoverages),
      changes: attachChangeLabels(foldedPolicy, endorsement.changes),
    });
  } catch (err) {
    next(err);
  }
});

// The endorsement's own standalone PDF — pending-watermarked while
// SUBMITTED, plain "REJECTED" stamp once rejected, fully signed once
// APPROVED. Backs the create-side "here's your endorsement" popup, the
// Endorsement Approval review dialog's own PDF pane, and "Re-export PDF".
router.get("/:id/pdf", validateParams(endorsementIdParamSchema), async (req, res, next) => {
  try {
    const access = await resolveViewAccess(req, res);
    if (!access) return;

    const endorsement = await prisma.endorsementRequest.findUnique({ where: { id: req.params.id }, select: endorsementPdfSelect });
    if (!endorsement) {
      return res.status(404).json({ error: "Endorsement not found" });
    }
    const policy = await prisma.policy.findFirst({
      where: { id: endorsement.policy_id, ...(access.agentId ? { agent_id: access.agentId } : {}) },
      select: policyDetailSelect,
    });
    if (!policy) {
      return res.status(404).json({ error: "Endorsement not found" });
    }

    const pdfBuffer = await renderEndorsementPdf(endorsement, policy);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${endorsement.endorsement_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// Re-sends the endorsement's own current PDF (draft or signed, matching its
// live status) to whatever email is on file for the insured party.
router.post("/:id/resend-email", validateParams(endorsementIdParamSchema), async (req, res, next) => {
  try {
    const access = await resolveViewAccess(req, res);
    if (!access) return;

    const endorsement = await prisma.endorsementRequest.findUnique({ where: { id: req.params.id }, select: endorsementPdfSelect });
    if (!endorsement) {
      return res.status(404).json({ error: "Endorsement not found" });
    }
    const policy = await prisma.policy.findFirst({
      where: { id: endorsement.policy_id, ...(access.agentId ? { agent_id: access.agentId } : {}) },
      select: policyDetailSelect,
    });
    if (!policy) {
      return res.status(404).json({ error: "Endorsement not found" });
    }

    const insuredEmail = policy.customer?.email || policy.company?.email;
    if (!insuredEmail) {
      return res.status(400).json({ error: "This customer/company has no email address on file" });
    }

    const pdfBuffer = await renderEndorsementPdf(endorsement, policy);
    const insuredName = policy.customer_name_snapshot || policy.company_name_snapshot;
    const html = `
      <div style="font-family:Arial,sans-serif;color:#111">
        <p>Dear ${insuredName},</p>
        <p>Please find endorsement No. ${endorsement.endorsement_number} to your Bethel General Insurance and Surety Corp. policy (No. ${policy.policy_number}) attached as a PDF.</p>
        <p>Please contact your agent (${policy.agent_code_snapshot}) with any questions.</p>
      </div>
    `;
    const text = [
      `Dear ${insuredName},`,
      "",
      `Please find endorsement No. ${endorsement.endorsement_number} to your Bethel General Insurance and Surety Corp. policy (No. ${policy.policy_number}) attached as a PDF.`,
      "",
      `Please contact your agent (${policy.agent_code_snapshot}) with any questions.`,
    ].join("\n");

    await sendMail({
      to: insuredEmail,
      subject: `Endorsement ${endorsement.endorsement_number} to Your Bethel Insurance Policy ${policy.policy_number}`,
      html,
      text,
      attachments: [{ filename: `${endorsement.endorsement_number}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
    });

    res.json({ sent: true, to: insuredEmail });
  } catch (err) {
    if (sendIfHttpError(err, res)) return;
    next(err);
  }
});

// Adds one more change line to a still-SUBMITTED CORRECTION endorsement — the
// Endorsement Approval review dialog's own "Create Change" action (the same
// edit capability an approver already has on an application's change list,
// now reachable on an agent's own endorsement submission too). A
// CANCELLATION request can never gain, edit, or lose lines this way — it's
// meant to stay exactly as filed (one synthesized CANCEL_POLICY line); reject
// it and file a fresh one if that's wrong.
router.post(
  "/:id/changes",
  requirePermission("APPROVE_ENDORSEMENT"),
  validateParams(endorsementIdParamSchema),
  validateBody(endorsementChangeSchema),
  async (req, res, next) => {
    try {
      const endorsement = await prisma.endorsementRequest.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true, request_type: true, policy_id: true, changes: { select: { id: true } } },
      });
      if (!endorsement) {
        return res.status(404).json({ error: "Endorsement not found" });
      }
      if (endorsement.status !== "SUBMITTED") {
        return res.status(409).json({ error: "This endorsement has already been decided — no further changes can be added" });
      }
      if (endorsement.request_type === "CANCELLATION") {
        return res.status(400).json({ error: "A cancellation request cannot be edited — reject it and file a new one if needed" });
      }

      const policy = await prisma.policy.findUnique({ where: { id: endorsement.policy_id }, select: policyDetailSelect });
      const priorApprovedChanges = (policy.endorsement_requests || []).flatMap((e) => e.changes);
      const ownExistingChanges = await prisma.endorsementChange.findMany({
        where: { endorsement_request_id: endorsement.id },
        orderBy: { created_at: "asc" },
      });

      const baseline = applyFoldedState(policy, foldEndorsementChanges(policy, [...priorApprovedChanges, ...ownExistingChanges]));
      const resolved = await resolveEndorsementChange(baseline, req.body, policy);

      const change = await prisma.endorsementChange.create({
        data: { ...resolved, endorsement_request_id: endorsement.id },
      });

      res.status(201).json(change);
    } catch (err) {
      if (sendIfHttpError(err, res)) return;
      next(err);
    }
  }
);

// Edits one existing change line on a still-SUBMITTED endorsement — recomputes
// change_from fresh (against every other line, this one excluded) rather than
// trusting the previously-stored value.
router.patch(
  "/:id/changes/:changeId",
  requirePermission("APPROVE_ENDORSEMENT"),
  validateParams(endorsementChangeIdParamSchema),
  validateBody(endorsementChangeSchema),
  async (req, res, next) => {
    try {
      const endorsement = await prisma.endorsementRequest.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true, request_type: true, policy_id: true },
      });
      if (!endorsement) {
        return res.status(404).json({ error: "Endorsement not found" });
      }
      if (endorsement.status !== "SUBMITTED") {
        return res.status(409).json({ error: "This endorsement has already been decided — no further changes can be made" });
      }
      if (endorsement.request_type === "CANCELLATION") {
        return res.status(400).json({ error: "A cancellation request cannot be edited — reject it and file a new one if needed" });
      }

      const existingChange = await prisma.endorsementChange.findFirst({
        where: { id: req.params.changeId, endorsement_request_id: endorsement.id },
      });
      if (!existingChange) {
        return res.status(404).json({ error: "Change not found on this endorsement" });
      }

      const policy = await prisma.policy.findUnique({ where: { id: endorsement.policy_id }, select: policyDetailSelect });
      const priorApprovedChanges = (policy.endorsement_requests || []).flatMap((e) => e.changes);
      const otherOwnChanges = await prisma.endorsementChange.findMany({
        where: { endorsement_request_id: endorsement.id, id: { not: existingChange.id } },
        orderBy: { created_at: "asc" },
      });

      const baseline = applyFoldedState(policy, foldEndorsementChanges(policy, [...priorApprovedChanges, ...otherOwnChanges]));
      const resolved = await resolveEndorsementChange(baseline, req.body, policy);

      const updated = await prisma.endorsementChange.update({
        where: { id: existingChange.id },
        data: resolved,
      });

      res.json(updated);
    } catch (err) {
      if (sendIfHttpError(err, res)) return;
      next(err);
    }
  }
);

// Removes one change line from a still-SUBMITTED endorsement — 400s rather
// than leaving the request with zero changes (reject it instead, if none of
// its lines should stand).
router.delete(
  "/:id/changes/:changeId",
  requirePermission("APPROVE_ENDORSEMENT"),
  validateParams(endorsementChangeIdParamSchema),
  async (req, res, next) => {
    try {
      const endorsement = await prisma.endorsementRequest.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true, request_type: true, changes: { select: { id: true } } },
      });
      if (!endorsement) {
        return res.status(404).json({ error: "Endorsement not found" });
      }
      if (endorsement.status !== "SUBMITTED") {
        return res.status(409).json({ error: "This endorsement has already been decided — no further changes can be made" });
      }
      if (endorsement.request_type === "CANCELLATION") {
        return res.status(400).json({ error: "A cancellation request cannot be edited — reject it and file a new one if needed" });
      }
      const existingChange = endorsement.changes.find((c) => c.id === req.params.changeId);
      if (!existingChange) {
        return res.status(404).json({ error: "Change not found on this endorsement" });
      }
      if (endorsement.changes.length <= 1) {
        return res.status(400).json({ error: "An endorsement must have at least one change — reject it instead" });
      }

      await prisma.endorsementChange.delete({ where: { id: req.params.changeId } });
      res.json({ id: req.params.changeId, deleted: true });
    } catch (err) {
      next(err);
    }
  }
);

// Approves the endorsement — logs an EndorsementApprovalHistory row and marks
// it APPROVED. A plain CORRECTION still never writes onto the Policy/
// PolicyVehicle/PolicyAddress row themselves (every later read folds it back
// in at read time — see routes/policies.js's applyEndorsementsToPolicyDetail)
// — but the two financial change types now DO produce real, permanent
// effects here: ADD_COVERAGE materializes its own PolicyCoverage row,
// REMOVE_CLAUSE soft-deletes one, and a CANCELLATION sets the Policy itself
// to CANCELLED — each crediting/debiting the filing agent's payable ledger
// (see EndorsementChangeType's own comment for the full design).
router.post(
  "/:id/approve",
  requirePermission("APPROVE_ENDORSEMENT"),
  validateParams(endorsementIdParamSchema),
  async (req, res, next) => {
    try {
      const endorsement = await prisma.endorsementRequest.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          status: true,
          request_type: true,
          policy_id: true,
          effective_date: true,
          send_policy_to_email_on_approval: true,
          changes: {
            select: {
              id: true,
              change_type: true,
              policy_vehicle_id: true,
              policy_coverage_id: true,
              product_coverage_id: true,
              coverage_amount: true,
              premium_amount: true,
              payable_to_bethel: true,
              applied_rate: true,
              is_misc: true,
              product_coverage: { select: { coverage_code: true, coverage_name: true, clause: true, pricing_mode: true } },
            },
          },
        },
      });
      if (!endorsement) {
        return res.status(404).json({ error: "Endorsement not found" });
      }
      if (endorsement.status === "APPROVED") {
        return res.status(409).json({ error: "This endorsement has already been approved" });
      }
      if (endorsement.status === "REJECTED") {
        return res.status(409).json({ error: "This endorsement has been rejected and can no longer be approved" });
      }

      const policy = await prisma.policy.findUnique({ where: { id: endorsement.policy_id }, select: policyDetailSelect });
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }

      await prisma.$transaction(async (tx) => {
        if (endorsement.request_type === "CANCELLATION") {
          const priorApprovedChanges = (policy.endorsement_requests || []).flatMap((e) => e.changes);
          const folded = applyFoldedState(policy, foldEndorsementChanges(policy, priorApprovedChanges));
          const commissionSoFar = await tx.agentPayableTransaction.aggregate({
            where: { policy_id: policy.id, transaction_type: { in: ["ISSUANCE", "ENDORSEMENT"] } },
            _sum: { amount: true },
          });
          const basisAmount = Number(commissionSoFar._sum.amount || 0);
          const proration = computeCancellationProration({
            basisAmount,
            effectiveDate: folded.effective_date,
            expiryDate: folded.expiry_date,
            cancellationDate: endorsement.effective_date,
          });

          await tx.policy.update({
            where: { id: policy.id },
            data: { policy_status: "CANCELLED", cancelled_at: endorsement.effective_date },
          });
          if (proration.deduction !== 0) {
            await tx.agentPayableTransaction.create({
              data: {
                agent_id: policy.agent_id,
                policy_id: policy.id,
                endorsement_request_id: endorsement.id,
                transaction_type: "CANCELLED_POLICY",
                amount: -proration.deduction,
                remarks: proration.description,
              },
            });
            await tx.agent.update({ where: { id: policy.agent_id }, data: { payable: { decrement: proration.deduction } } });
          }
        } else {
          let coverageSetChanged = false;
          for (const change of endorsement.changes) {
            if (change.change_type === "ADD_COVERAGE") {
              const createdCoverage = await tx.policyCoverage.create({
                data: {
                  policy_id: policy.id,
                  coverage_id: change.product_coverage_id,
                  coverage_code_snapshot: change.product_coverage.coverage_code,
                  coverage_name_snapshot: change.product_coverage.coverage_name,
                  clause_snapshot: change.product_coverage.clause || "",
                  pricing_mode_snapshot: change.product_coverage.pricing_mode,
                  coverage_amount: change.coverage_amount,
                  premium_amount: change.premium_amount,
                  payable_to_bethel: change.payable_to_bethel,
                  applied_rate: change.applied_rate,
                  is_misc_snapshot: Boolean(change.is_misc),
                  policy_vehicle_id: change.policy_vehicle_id,
                  added_by_endorsement_id: endorsement.id,
                },
              });
              await tx.endorsementChange.update({
                where: { id: change.id },
                data: { created_policy_coverage_id: createdCoverage.id },
              });

              const margin = round2(Number(change.premium_amount) - Number(change.payable_to_bethel));
              await tx.agentPayableTransaction.create({
                data: {
                  agent_id: policy.agent_id,
                  policy_id: policy.id,
                  endorsement_request_id: endorsement.id,
                  transaction_type: "ENDORSEMENT",
                  amount: margin,
                  remarks: `Added coverage "${change.product_coverage.coverage_name}" via endorsement ${endorsement.id}`,
                },
              });
              await tx.agent.update({ where: { id: policy.agent_id }, data: { payable: { increment: margin } } });
              coverageSetChanged = true;
            } else if (change.change_type === "REMOVE_CLAUSE") {
              const targetCoverage = await tx.policyCoverage.findUnique({ where: { id: change.policy_coverage_id } });
              if (!targetCoverage || targetCoverage.removed_at) {
                throw new HttpError(409, "This coverage has already been removed");
              }
              await tx.policyCoverage.update({
                where: { id: targetCoverage.id },
                data: { removed_at: new Date(), removed_by_endorsement_id: endorsement.id },
              });

              const payableToBethel =
                change.payable_to_bethel !== null && change.payable_to_bethel !== undefined
                  ? Number(change.payable_to_bethel)
                  : Number(change.premium_amount);
              const margin = round2(Number(change.premium_amount) - payableToBethel);
              await tx.agentPayableTransaction.create({
                data: {
                  agent_id: policy.agent_id,
                  policy_id: policy.id,
                  endorsement_request_id: endorsement.id,
                  transaction_type: "ENDORSEMENT",
                  amount: -margin,
                  remarks: `Removed coverage "${targetCoverage.coverage_name_snapshot}" via endorsement ${endorsement.id}`,
                },
              });
              await tx.agent.update({ where: { id: policy.agent_id }, data: { payable: { decrement: margin } } });
              coverageSetChanged = true;
            }
          }

          if (coverageSetChanged) {
            const [activeCoverages, productVariant] = await Promise.all([
              tx.policyCoverage.findMany({
                where: { policy_id: policy.id, removed_at: null },
                select: { premium_amount: true, is_misc_snapshot: true },
              }),
              tx.productVariant.findUnique({ where: { id: policy.product_variant_id }, select: { misc_fee: true } }),
            ]);
            const totals = computeChargeTotals(
              activeCoverages.map((c) => ({ premium_amount: c.premium_amount, is_misc: c.is_misc_snapshot })),
              productVariant?.misc_fee
            );
            await tx.policy.update({
              where: { id: policy.id },
              data: {
                total_premium: totals.totalPremium,
                doc_stamps: totals.docStamps,
                vat: totals.vat,
                lgt: totals.lgt,
                misc: totals.misc,
              },
            });
          }
        }

        await tx.endorsementRequest.update({ where: { id: endorsement.id }, data: { status: "APPROVED" } });
        await tx.endorsementApprovalHistory.create({
          data: {
            endorsement_request_id: endorsement.id,
            approver_id: req.user.userId,
            decision: "APPROVED",
            decision_date: new Date(),
          },
        });
        // One more required in-lease task against this policy — same
        // "unaccomplished until processed from the In-Lease Backlogs page"
        // contract as the FOR_UPLOAD row POST /policy-approval/:id/approve
        // creates at issuance. endorsement_request_id lets that page's detail
        // dialog show this specific endorsement's own changes in copyable
        // format rather than the policy's static issuance fields.
        await tx.inLeaseBacklog.create({
          data: {
            policy_id: endorsement.policy_id,
            type: "FOR_ENDORSEMENT",
            endorsement_request_id: endorsement.id,
          },
        });
      });

      if (endorsement.send_policy_to_email_on_approval) {
        try {
          const [fullEndorsement, refreshedPolicy] = await Promise.all([
            prisma.endorsementRequest.findUnique({ where: { id: endorsement.id }, select: endorsementPdfSelect }),
            prisma.policy.findUnique({ where: { id: endorsement.policy_id }, select: policyDetailSelect }),
          ]);
          const insuredEmail = refreshedPolicy.customer?.email || refreshedPolicy.company?.email;
          if (insuredEmail) {
            const pdfBuffer = await renderEndorsementPdf(fullEndorsement, refreshedPolicy);
            const insuredName = refreshedPolicy.customer_name_snapshot || refreshedPolicy.company_name_snapshot;
            const { subject, html, text } = buildEndorsementApprovedEmailContent({
              insuredName,
              policyNumber: refreshedPolicy.policy_number,
              endorsementNumber: fullEndorsement.endorsement_number,
              effectiveDate: fullEndorsement.effective_date,
            });
            await sendMail({
              to: insuredEmail,
              subject,
              html,
              text,
              attachments: [
                { filename: `${fullEndorsement.endorsement_number}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
              ],
            });
          }
        } catch (mailErr) {
          console.error("[endorsements] failed to send approval email", mailErr);
        }
      }

      res.json({ id: endorsement.id, status: "APPROVED" });
    } catch (err) {
      if (sendIfHttpError(err, res)) return;
      next(err);
    }
  }
);

// Rejects the endorsement — terminal, same as an application's own
// POST /:id/reject. Never touches the Policy.
router.post(
  "/:id/reject",
  requirePermission("APPROVE_ENDORSEMENT"),
  validateParams(endorsementIdParamSchema),
  validateBody(rejectEndorsementSchema),
  async (req, res, next) => {
    try {
      const endorsement = await prisma.endorsementRequest.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
      if (!endorsement) {
        return res.status(404).json({ error: "Endorsement not found" });
      }
      if (endorsement.status === "APPROVED") {
        return res.status(409).json({ error: "This endorsement has already been approved and can no longer be rejected" });
      }
      if (endorsement.status === "REJECTED") {
        return res.status(409).json({ error: "This endorsement has already been rejected" });
      }

      await prisma.$transaction([
        prisma.endorsementRequest.update({ where: { id: endorsement.id }, data: { status: "REJECTED" } }),
        prisma.endorsementApprovalHistory.create({
          data: {
            endorsement_request_id: endorsement.id,
            approver_id: req.user.userId,
            decision: "REJECTED",
            comments: req.body.remarks,
            decision_date: new Date(),
          },
        }),
      ]);

      res.json({ id: endorsement.id, status: "REJECTED" });
    } catch (err) {
      if (sendIfHttpError(err, res)) return;
      next(err);
    }
  }
);

module.exports = router;
