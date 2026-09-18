const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, requireAnyPermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody, validateQuery, validateParams } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const { fetchByPriority } = require("../lib/priorityPagination");
const { resolveCoverageRows, computeChargeTotals, round2 } = require("../lib/coveragePricing");
const { computeDueDate, applyDebitToOriginalBucket } = require("../lib/agentPayables");
const { currentVehicleValue } = require("../lib/vehicleValue");
const {
  VEHICLE_CHANGE_TYPES,
  COVERAGE_TARGET_CHANGE_TYPES,
  createEndorsementRequestSchema,
  endorsementChangeSchema,
  approveEndorsementSchema,
  rejectEndorsementSchema,
  listEndorsementRequestsQuerySchema,
  listPoliciesForEndorsementQuerySchema,
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

// The Endorsements page's own "New Admin Endorsement" policy-search
// Autocomplete (VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT only) — every policy
// in the system, not scoped to any one agent, since that's the whole point
// of this admin flow. search matches policy_number and the frozen insured-
// name snapshot columns (same fields Client Policies' own GET /policies
// search matches). Registered before GET /:id and GET /policy/:policyId
// below so Express doesn't try to parse "policies" as an endorsement id.
router.get(
  "/policies",
  requirePermission("VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT"),
  validateQuery(listPoliciesForEndorsementQuerySchema),
  async (req, res, next) => {
    try {
      const { page, page_size: pageSize, search } = req.query;
      const where = search
        ? {
            OR: [
              { policy_number: { contains: search, mode: "insensitive" } },
              { customer_name_snapshot: { contains: search, mode: "insensitive" } },
              { company_name_snapshot: { contains: search, mode: "insensitive" } },
            ],
          }
        : {};
      const [data, total] = await Promise.all([
        prisma.policy.findMany({
          where,
          orderBy: { issue_date: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            policy_number: true,
            customer_name_snapshot: true,
            company_name_snapshot: true,
            agent_code_snapshot: true,
            policy_status: true,
          },
        }),
        prisma.policy.count({ where }),
      ]);
      res.json({
        data: data.map((p) => ({
          id: p.id,
          policy_number: p.policy_number,
          insured_name: p.customer_name_snapshot || p.company_name_snapshot,
          agent_code: p.agent_code_snapshot,
          policy_status: p.policy_status,
        })),
        total,
        page,
        page_size: pageSize,
      });
    } catch (err) {
      next(err);
    }
  }
);

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
// so can an admin holding VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT — same
// reasoning as APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION elsewhere in this
// app: a caller who can file an endorsement against any agent's policy also
// needs to view/resend whatever they just filed, without a second, separate
// "admin view" permission to grant alongside it. An ordinary agent holding
// VIEW_POLICIES.CREATE_ENDORSEMENT can only view/resend endorsements against
// their own agent's policies (VIEW_POLICIES itself is enough to *view* —
// the .CREATE_ENDORSEMENT sub-permission only gates actually filing one,
// same "page access isn't write access" split as CREATE_APPLICATION/
// .AGENT_ISSUANCE). Returns { agentId: null } for either any-policy tier,
// { agentId } for the own-policy tier, or null (having already written the
// 403/400 response) on failure — every caller does `if (!access) return;`
// right after.
async function resolveViewAccess(req, res) {
  const codes = await getUserPermissionCodes(req.user.userId);
  if (codes.has("APPROVE_ENDORSEMENT") || codes.has("VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT")) {
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

// Same any-agent-or-own-agent split as resolveViewAccess above, but for the
// *filing* side (GET /policy/:policyId(/context), POST /, POST /preview-pdf)
// — VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT grants { agentId: null } (file
// against any policy in the system), VIEW_POLICIES.CREATE_ENDORSEMENT grants
// { agentId } (own policies only), same 403/400-then-null-on-failure contract.
async function resolveCreateAccess(req, res) {
  const codes = await getUserPermissionCodes(req.user.userId);
  if (codes.has("VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT")) {
    return { agentId: null };
  }
  if (codes.has("VIEW_POLICIES.CREATE_ENDORSEMENT")) {
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      res.status(400).json({ error: "Your account isn't linked to an agent profile" });
      return null;
    }
    return { agentId };
  }
  res.status(403).json({
    error: "Missing required permission: VIEW_POLICIES.CREATE_ENDORSEMENT or VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT",
  });
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

// Prices a VEHICLE_ESTIMATED_VALUE change — corrects one policy vehicle's
// assessed value and recomputes the margin of whichever single
// VALUE_PERCENTAGE PolicyCoverage row is priced off that vehicle, through the
// exact same lib/coveragePricing.js engine used everywhere else (a
// single-coverage, single-vehicle call, same shape as priceAddCoverageChange
// above — the new value is passed in directly as the vehicle's value rather
// than depreciated through currentVehicleValue, since the agent/approver is
// stating what the vehicle is actually worth right now, superseding whatever
// depreciation would otherwise say). Unlike ADD_COVERAGE, this never creates
// a new PolicyCoverage row — it corrects an existing one in place — so the
// coverage_amount/premium_amount/payable_to_bethel this returns are DELTAS
// (new minus old), not absolute values: POST /:id/approve adds them onto the
// existing row, and computeEndorsementChargeDelta below sums them directly
// into the printed endorsement's own charges the same way it already sums
// ADD_COVERAGE's absolute premium_amount. The agent's own original margin
// (premium_amount minus payable_to_bethel) on that row is preserved — only
// the portion actually owed to Bethel moves with the corrected value.
async function priceVehicleValueChange(policy, baseline, input) {
  if (!input.policy_vehicle_id) {
    throw new HttpError(400, "policy_vehicle_id is required to correct a vehicle's estimated value");
  }
  const newValue = Number(input.new_value);
  if (!Number.isFinite(newValue) || newValue < 0) {
    throw new HttpError(400, "new_value must be a non-negative number");
  }

  const policyVehicle = await prisma.policyVehicle.findFirst({
    where: { id: input.policy_vehicle_id, policy_id: baseline.id },
    select: {
      no_of_seats_snapshot: true,
      vehicle: { select: { estimated_value: true } },
    },
  });
  if (!policyVehicle) {
    throw new HttpError(400, "policy_vehicle_id does not belong to this policy");
  }

  // An issuance-time PolicyCoverage row doesn't retain which of possibly-
  // several vehicles it was originally priced against (policy_vehicle_id is
  // only ever set on a row an ADD_COVERAGE endorsement itself created) — so
  // this can only unambiguously match a VALUE_PERCENTAGE row on a
  // single-vehicle policy, or one that was itself added via ADD_COVERAGE and
  // so already carries the right policy_vehicle_id. A multi-vehicle policy
  // whose VALUE_PERCENTAGE coverage predates any such endorsement has no
  // reliable row to target here — an accepted gap, same as
  // lib/policyConflicts.js's own documented one.
  const isSingleVehiclePolicy = baseline.vehicles.length === 1;
  const candidates = baseline.coverages.filter(
    (c) =>
      c.pricing_mode_snapshot === "VALUE_PERCENTAGE" &&
      (c.policy_vehicle_id === input.policy_vehicle_id || (isSingleVehiclePolicy && !c.policy_vehicle_id))
  );
  if (candidates.length === 0) {
    throw new HttpError(400, "This vehicle has no value-based coverage on this policy to reprice");
  }
  if (candidates.length > 1) {
    throw new HttpError(
      400,
      "This vehicle has more than one value-based coverage on this policy — remove and re-add the affected coverage instead of correcting its value"
    );
  }
  const targetCoverage = candidates[0];

  const resolvedRows = await resolveCoverageRows({
    coverages: [{ coverage_id: targetCoverage.coverage_id, vehicle_indices: [0], coverage_amount: 1, premium_amount: Number.MAX_SAFE_INTEGER }],
    className: policy.class_name_snapshot,
    vehicles: [{ no_of_seats: policyVehicle.no_of_seats_snapshot }],
    vehicleValues: [newValue],
    agentId: policy.agent_id,
    startAt: new Date(baseline.effective_date),
    endAt: new Date(baseline.expiry_date),
  });
  const resolved = resolvedRows[0];

  const oldPremium = Number(targetCoverage.premium_amount);
  const oldPayable = Number(targetCoverage.payable_to_bethel ?? oldPremium);
  const oldCoverageAmount = Number(targetCoverage.coverage_amount);
  const originalMargin = round2(oldPremium - oldPayable);
  const newPremium = round2(resolved.payable_to_bethel + originalMargin);

  return {
    policy_vehicle_id: input.policy_vehicle_id,
    policy_coverage_id: targetCoverage.id,
    change_type: "VEHICLE_ESTIMATED_VALUE",
    change_from: `Estimated value ₱${formatMoney(policyVehicle.vehicle.estimated_value ?? 0)} — ${targetCoverage.coverage_name_snapshot} Coverage Amount ₱${formatMoney(oldCoverageAmount)}, Premium ₱${formatMoney(oldPremium)}`,
    change_to: `Estimated value ₱${formatMoney(newValue)} — ${targetCoverage.coverage_name_snapshot} Coverage Amount ₱${formatMoney(resolved.coverage_amount)}, Premium ₱${formatMoney(newPremium)}`,
    remarks: input.remarks || null,
    product_coverage_id: null,
    // Deltas, not absolutes — see this function's own comment above.
    coverage_amount: round2(resolved.coverage_amount - oldCoverageAmount),
    premium_amount: round2(newPremium - oldPremium),
    payable_to_bethel: round2(resolved.payable_to_bethel - oldPayable),
    applied_rate: resolved.applied_rate,
    is_misc: targetCoverage.is_misc_snapshot,
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

  if (change_type === "VEHICLE_ESTIMATED_VALUE") {
    return priceVehicleValueChange(policy, baseline, input);
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
      // Live, not a snapshot — see policyDetailSelect's own note; the
      // VEHICLE_ESTIMATED_VALUE composer's "current value" placeholder.
      estimated_value: v.vehicle?.estimated_value ?? null,
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
// contributes the removed line's own premium_amount negatively (a refund),
// VEHICLE_ESTIMATED_VALUE contributes its own premium_amount as-is (already a
// signed delta — see priceVehicleValueChange) — run through the same
// total_premium/doc_stamps/vat/lgt/misc split computeChargeTotals uses
// elsewhere, then totalled. Every other change type contributes nothing (no
// premium/coverage-amount effect at all — see EndorsementChangeType's own
// comment).
//
// CANCEL_POLICY is a special case, not summed with the rest — a
// CANCELLATION's single synthesized line carries no premium/coverage-amount
// of its own to sum (its actual payable effect is a separate ledger debit,
// computeCancellationProration, not a premium/coverage change), but the
// printed endorsement's own charges block still has to show *something*
// meaningful rather than a flat, misleading 0 — cancelling reverses this
// policy's entire current charges, so this returns the negative of whatever
// `policy` (a policyDetailSelect-shaped row, or its already-folded baseline —
// folding never touches these columns, see Policy.total_premium's own schema
// comment) is presently charging. `policy` is only ever required by callers
// that might pass a CANCEL_POLICY change (renderEndorsementPdf, the
// preview-pdf draft route below) — every other caller only ever deals in
// CORRECTION changes and can omit it.
function computeEndorsementChargeDelta(changes, policy) {
  const cancelChange = changes.find((c) => c.change_type === "CANCEL_POLICY");
  if (cancelChange) {
    const totalPremium = round2(-Number(policy?.total_premium || 0));
    const docStamps = round2(-Number(policy?.doc_stamps || 0));
    const vat = round2(-Number(policy?.vat || 0));
    const lgt = round2(-Number(policy?.lgt || 0));
    const misc = round2(-Number(policy?.misc || 0));
    return { totalPremium, docStamps, vat, lgt, misc, totalAmount: round2(totalPremium + docStamps + vat + lgt + misc) };
  }

  const rows = [];
  for (const c of changes) {
    if (c.change_type === "ADD_COVERAGE" && c.premium_amount != null) {
      rows.push({ premium_amount: Number(c.premium_amount), is_misc: Boolean(c.is_misc) });
    } else if (c.change_type === "REMOVE_CLAUSE" && c.premium_amount != null) {
      rows.push({ premium_amount: -Number(c.premium_amount), is_misc: Boolean(c.is_misc) });
    } else if (c.change_type === "VEHICLE_ESTIMATED_VALUE" && c.premium_amount != null) {
      rows.push({ premium_amount: Number(c.premium_amount), is_misc: Boolean(c.is_misc) });
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

// How much of an ADD_COVERAGE/REMOVE_CLAUSE/VEHICLE_ESTIMATED_VALUE line's
// own margin (or margin delta) actually gets credited/debited to the agent's
// payable ledger, by default — the fraction of the policy's own current
// coverage period still remaining as of this endorsement's own effective_date,
// same remaining-days-over-full-period shape as computeCancellationProration
// above, just without the "already elapsed" framing (there's no cancellation
// date here, only "from here to expiry"). Returns 1 (no proration at all)
// once the endorsement's effective_date is on/before the period's own start,
// and clamps to [0, 1] either way — an endorsement can't earn negative or
// more-than-full margin just because its own effective_date landed outside
// the period. Called only when the approver leaves POST /:id/approve's own
// `prorate` flag at its default `true`; passing `prorate: false` (the review
// dialog's "Do not apply pro-rated" checkbox) skips this entirely and posts
// the full margin/delta instead, same as this app's original behavior before
// this flag existed.
function computeProrationFactor(effectiveDate, expiryDate, endorsementEffectiveDate) {
  const totalMs = new Date(expiryDate).getTime() - new Date(effectiveDate).getTime();
  if (totalMs <= 0) return 1;
  const remainingMs = new Date(expiryDate).getTime() - new Date(endorsementEffectiveDate).getTime();
  return Math.max(0, Math.min(1, remainingMs / totalMs));
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
  const delta = computeEndorsementChargeDelta(endorsement.changes, baseline);

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
// VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT also admits this (any policy, not
// just the caller's own agent) — same reasoning as resolveCreateAccess's own
// comment: an admin who can file against any policy needs to see its history
// too. requirePermission("VIEW_POLICIES") alone still admits an ordinary
// agent, own-agent-scoped, same as before.
router.get(
  "/policy/:policyId",
  requireAnyPermission(["VIEW_POLICIES", "VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT"]),
  validateParams(policyIdParamSchema),
  async (req, res, next) => {
    try {
      const codes = await getUserPermissionCodes(req.user.userId);
      let agentId = null;
      if (!codes.has("VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT")) {
        agentId = await getCurrentAgentId(req.user.userId);
        if (!agentId) {
          return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
        }
      }
      const policy = await prisma.policy.findFirst({
        where: { id: req.params.policyId, ...(agentId ? { agent_id: agentId } : {}) },
        select: { id: true },
      });
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
  requireAnyPermission(["VIEW_POLICIES.CREATE_ENDORSEMENT", "VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT"]),
  validateParams(policyIdParamSchema),
  async (req, res, next) => {
    try {
      const access = await resolveCreateAccess(req, res);
      if (!access) return;
      const policy = await prisma.policy.findFirst({
        where: { id: req.params.policyId, ...(access.agentId ? { agent_id: access.agentId } : {}) },
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
// Endorsement Request" panel. An ordinary agent can only endorse their own
// policies; a caller holding VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT instead
// (an admin who may not even be an agent themselves) can file against any
// policy in the system — created_by_agent_id then falls back to the policy's
// own agent_id, same "attribute to the policy's real owning agent regardless
// of who administratively acts on it" reasoning POST /policy-approval/:id/approve
// already follows for its own ledger credit. Every proposed change is
// resolved (change_from computed, never trusted from the client) and saved
// together with the header row in one transaction. endorsement_number is
// "<policy_number>-E<sequence_no>", sequence_no counted per policy. A
// CANCELLATION request carries no client-submitted changes at all — the
// server synthesizes the single CANCEL_POLICY line itself (its actual
// payable effect is computed fresh at approval, not here — see
// POST /:id/approve). A caller filing via the admin tier (access.agentId
// null) has this same endorsement immediately approved too, in the same
// request — see the call to approveEndorsementRecord() below.
router.post(
  "/",
  requireAnyPermission(["VIEW_POLICIES.CREATE_ENDORSEMENT", "VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT"]),
  validateBody(createEndorsementRequestSchema),
  async (req, res, next) => {
    try {
      const access = await resolveCreateAccess(req, res);
      if (!access) return;

      const { policy_id, request_type, effective_date, remarks, send_policy_to_email, send_policy_to_email_on_approval, changes } =
        req.body;

      const policy = await prisma.policy.findFirst({
        where: { id: policy_id, ...(access.agentId ? { agent_id: access.agentId } : {}) },
        select: policyDetailSelect,
      });
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }
      const filingAgentId = access.agentId || policy.agent_id;
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
            created_by_agent_id: filingAgentId,
            created_by_user_id: req.user.userId,
          },
        });

        await tx.endorsementChange.createMany({
          data: resolvedChanges.map((c) => ({ ...c, endorsement_request_id: endorsement.id })),
        });

        return endorsement;
      });

      // Admin tier: file-and-approve in one action (see this route's own
      // comment) — the "now under review" pending-draft email below is
      // skipped entirely for the same reason POST /policy-approval/
      // admin-applications skips its own equivalent: this endorsement never
      // actually sits under review, so that notice would misstate what just
      // happened. approveEndorsementRecord itself still fires
      // send_policy_to_email_on_approval, if it was checked, once actually
      // approved.
      if (access.agentId === null) {
        const approved = await approveEndorsementRecord({
          endorsementId: created.id,
          approverUserId: req.user.userId,
          prorate: true,
        });
        return res.status(201).json({
          id: created.id,
          endorsement_number: created.endorsement_number,
          status: approved.status,
        });
      }

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
  requireAnyPermission(["VIEW_POLICIES.CREATE_ENDORSEMENT", "VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT"]),
  validateBody(createEndorsementRequestSchema),
  async (req, res, next) => {
    try {
      const access = await resolveCreateAccess(req, res);
      if (!access) return;

      const { policy_id, request_type, effective_date, remarks, changes } = req.body;
      const policy = await prisma.policy.findFirst({
        where: { id: policy_id, ...(access.agentId ? { agent_id: access.agentId } : {}) },
        select: policyDetailSelect,
      });
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
      const delta = computeEndorsementChargeDelta(resolvedChanges, baseline);

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
// (see EndorsementChangeType's own comment for the full design). Pulled into
// its own function (not a route) so the admin-endorsement flow in POST /
// above can call it immediately after creating an endorsement — an admin
// filing via VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT is both the filer and the
// approver in one action, same "create-and-approve in one step" shape
// POST /policy-approval/admin-applications already uses for applications.
async function approveEndorsementRecord({ endorsementId, approverUserId, prorate }) {
      const endorsement = await prisma.endorsementRequest.findUnique({
        where: { id: endorsementId },
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
        throw new HttpError(404, "Endorsement not found");
      }
      if (endorsement.status === "APPROVED") {
        throw new HttpError(409, "This endorsement has already been approved");
      }
      if (endorsement.status === "REJECTED") {
        throw new HttpError(409, "This endorsement has been rejected and can no longer be approved");
      }

      const policy = await prisma.policy.findUnique({ where: { id: endorsement.policy_id }, select: policyDetailSelect });
      if (!policy) {
        throw new HttpError(404, "Policy not found");
      }

      // Computed once, shared by both branches below — the policy's own
      // current (every earlier-approved endorsement folded in) effective/
      // expiry dates, needed by a CANCELLATION's own day-proration and by a
      // CORRECTION's ADD_COVERAGE/REMOVE_CLAUSE/VEHICLE_ESTIMATED_VALUE
      // lines' own remaining-period proration (see computeProrationFactor).
      const priorApprovedChanges = (policy.endorsement_requests || []).flatMap((e) => e.changes);
      const folded = applyFoldedState(policy, foldEndorsementChanges(policy, priorApprovedChanges));
      const prorationFactor = prorate
        ? computeProrationFactor(folded.effective_date, folded.expiry_date, endorsement.effective_date)
        : 1;

      await prisma.$transaction(async (tx) => {
        if (endorsement.request_type === "CANCELLATION") {
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
            // A cancellation clawback claws back against the policy's own
            // original ISSUANCE bucket (same treatment as a REMOVE_CLAUSE
            // debit below) rather than opening an independent one — it's
            // reducing commission already credited for *this* policy, not
            // creating a new one of its own with a fresh due date.
            const appliesToId = await applyDebitToOriginalBucket(tx, policy.id, proration.deduction);
            await tx.agentPayableTransaction.create({
              data: {
                agent_id: policy.agent_id,
                policy_id: policy.id,
                endorsement_request_id: endorsement.id,
                transaction_type: "CANCELLED_POLICY",
                amount: -proration.deduction,
                remarks: proration.description,
                applies_to_transaction_id: appliesToId,
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
              // Prorated by default against how much of the coverage period
              // remains from this endorsement's own effective_date — see
              // computeProrationFactor — unless the approver checked "Do not
              // apply pro-rated" (prorate: false, prorationFactor === 1).
              // Only the ledger amount is prorated; the PolicyCoverage row
              // itself always carries the coverage's own full, correctly-
              // priced premium/coverage_amount.
              const postedAmount = round2(margin * prorationFactor);
              // An ADD_COVERAGE credit opens its own new payable-aging
              // bucket — its own due date off this endorsement's own
              // effective_date, independent of the policy's original
              // ISSUANCE bucket (see lib/agentPayables.js).
              const addingAgent = await tx.agent.findUnique({
                where: { id: policy.agent_id },
                select: { payment_terms_days: true },
              });
              await tx.agentPayableTransaction.create({
                data: {
                  agent_id: policy.agent_id,
                  policy_id: policy.id,
                  endorsement_request_id: endorsement.id,
                  transaction_type: "ENDORSEMENT",
                  amount: postedAmount,
                  remarks:
                    `Added coverage "${change.product_coverage.coverage_name}" via endorsement ${endorsement.id}` +
                    (prorationFactor < 1 ? ` (prorated ${Math.round(prorationFactor * 100)}% of ₱${formatMoney(margin)} margin)` : ""),
                  due_date: computeDueDate(endorsement.effective_date, addingAgent.payment_terms_days),
                  remaining_amount: postedAmount,
                },
              });
              await tx.agent.update({ where: { id: policy.agent_id }, data: { payable: { increment: postedAmount } } });
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
              // Same prorate-by-default treatment as ADD_COVERAGE above.
              const postedAmount = round2(margin * prorationFactor);
              // A REMOVE_CLAUSE debit claws back against the policy's own
              // original ISSUANCE bucket rather than opening a new one — see
              // lib/agentPayables.js's applyDebitToOriginalBucket.
              const appliesToId = await applyDebitToOriginalBucket(tx, policy.id, postedAmount);
              await tx.agentPayableTransaction.create({
                data: {
                  agent_id: policy.agent_id,
                  policy_id: policy.id,
                  endorsement_request_id: endorsement.id,
                  transaction_type: "ENDORSEMENT",
                  amount: -postedAmount,
                  remarks:
                    `Removed coverage "${targetCoverage.coverage_name_snapshot}" via endorsement ${endorsement.id}` +
                    (prorationFactor < 1 ? ` (prorated ${Math.round(prorationFactor * 100)}% of ₱${formatMoney(margin)} margin)` : ""),
                  applies_to_transaction_id: appliesToId,
                },
              });
              await tx.agent.update({ where: { id: policy.agent_id }, data: { payable: { decrement: postedAmount } } });
              coverageSetChanged = true;
            } else if (change.change_type === "VEHICLE_ESTIMATED_VALUE") {
              const targetCoverage = await tx.policyCoverage.findUnique({ where: { id: change.policy_coverage_id } });
              if (!targetCoverage || targetCoverage.removed_at) {
                throw new HttpError(409, "The value-based coverage this change targets has since been removed");
              }
              const newCoverageAmount = round2(Number(targetCoverage.coverage_amount) + Number(change.coverage_amount));
              const newPremium = round2(Number(targetCoverage.premium_amount) + Number(change.premium_amount));
              const oldPayable =
                targetCoverage.payable_to_bethel !== null && targetCoverage.payable_to_bethel !== undefined
                  ? Number(targetCoverage.payable_to_bethel)
                  : Number(targetCoverage.premium_amount);
              const newPayable = round2(oldPayable + Number(change.payable_to_bethel));
              await tx.policyCoverage.update({
                where: { id: targetCoverage.id },
                data: {
                  coverage_amount: newCoverageAmount,
                  premium_amount: newPremium,
                  payable_to_bethel: newPayable,
                  applied_rate: change.applied_rate,
                },
              });

              // change.premium_amount/payable_to_bethel are already deltas
              // (new minus old — see priceVehicleValueChange), so the margin
              // delta is just their difference; same prorate-by-default
              // treatment as ADD_COVERAGE/REMOVE_CLAUSE above. The sign of
              // the resulting posted amount decides how it's booked, same
              // convention lib/agentPayables.js's isBucketTransactionType
              // relies on everywhere else: a non-negative ENDORSEMENT amount
              // is always its own new bucket (mirrors ADD_COVERAGE's own
              // credit, own due_date), a negative one always claws back
              // against the policy's original ISSUANCE bucket (mirrors
              // REMOVE_CLAUSE's own debit) — never left ambiguous the way an
              // unconditional clawback regardless of sign would leave it.
              const marginDelta = round2(Number(change.premium_amount) - Number(change.payable_to_bethel));
              const postedAmount = round2(marginDelta * prorationFactor);
              // Recorded even when exactly 0 (a fully-prorated-away or
              // net-unchanged correction) — same "the ledger's own
              // row-per-change history stays complete, no silent gaps"
              // reasoning as ADD_COVERAGE's own ISSUANCE-style credit above.
              if (postedAmount >= 0) {
                const owningAgent = await tx.agent.findUnique({
                  where: { id: policy.agent_id },
                  select: { payment_terms_days: true },
                });
                await tx.agentPayableTransaction.create({
                  data: {
                    agent_id: policy.agent_id,
                    policy_id: policy.id,
                    endorsement_request_id: endorsement.id,
                    transaction_type: "ENDORSEMENT",
                    amount: postedAmount,
                    remarks:
                      `Corrected vehicle estimated value via endorsement ${endorsement.id}` +
                      (prorationFactor < 1 ? ` (prorated ${Math.round(prorationFactor * 100)}% of ₱${formatMoney(marginDelta)} margin increase)` : ""),
                    due_date: computeDueDate(endorsement.effective_date, owningAgent.payment_terms_days),
                    remaining_amount: postedAmount,
                  },
                });
                await tx.agent.update({ where: { id: policy.agent_id }, data: { payable: { increment: postedAmount } } });
              } else {
                const debitAmount = -postedAmount;
                const appliesToId = await applyDebitToOriginalBucket(tx, policy.id, debitAmount);
                await tx.agentPayableTransaction.create({
                  data: {
                    agent_id: policy.agent_id,
                    policy_id: policy.id,
                    endorsement_request_id: endorsement.id,
                    transaction_type: "ENDORSEMENT",
                    amount: postedAmount,
                    remarks:
                      `Corrected vehicle estimated value via endorsement ${endorsement.id}` +
                      (prorationFactor < 1 ? ` (prorated ${Math.round(prorationFactor * 100)}% of ₱${formatMoney(-marginDelta)} margin decrease)` : ""),
                    applies_to_transaction_id: appliesToId,
                  },
                });
                await tx.agent.update({ where: { id: policy.agent_id }, data: { payable: { decrement: debitAmount } } });
              }
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
            approver_id: approverUserId,
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

      return { id: endorsement.id, status: "APPROVED" };
}

// Thin HTTP wrapper around approveEndorsementRecord above — resolves
// req.params/req.body/req.user.userId and delegates.
router.post(
  "/:id/approve",
  requirePermission("APPROVE_ENDORSEMENT"),
  validateParams(endorsementIdParamSchema),
  validateBody(approveEndorsementSchema),
  async (req, res, next) => {
    try {
      const result = await approveEndorsementRecord({
        endorsementId: req.params.id,
        approverUserId: req.user.userId,
        prorate: req.body.prorate,
      });
      res.json(result);
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
