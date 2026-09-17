const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateQuery, validateParams } = require("../middleware/validate");
const { listInLeaseBacklogQuerySchema, idParamSchema } = require("../schemas/inLeaseBacklog");
const { changeTitle, describeChange } = require("../pdf/endorsementPdf");

const router = express.Router();

// MANAGE_INLEASE is page access + view (list/detail); the two mutating
// routes below each need their own more specific grant on top, same
// "page access isn't write access" pattern as CREATE_APPLICATION/
// CREATE_APPLICATION.AGENT_ISSUANCE elsewhere in this app. Deliberately not
// agent-scoped — this is a back-office queue spanning every policy in the
// system, same reasoning as Policy Approval.
router.use(requireAuth, requirePermission("MANAGE_INLEASE"));

// Ordered by created_at ascending so [0], if any, is the earliest-created
// still-unaccomplished task — "the earliest unaccomplished task" the queue
// is meant to surface per policy.
const backlogSelect = {
  id: true,
  type: true,
  accomplished_by_user_id: true,
  accomplished_at: true,
  created_at: true,
};

// A policy's own in-lease status is never stored — it's derived from
// whether every one of its InLeaseBacklog rows has been accomplished.
function currentTaskOf(backlogs) {
  return backlogs.find((b) => !b.accomplished_by_user_id) || null;
}

// Every issued policy, latest-issue-oldest-first by default — the queue is
// meant to be worked oldest-first, and since a FOR_UPLOAD row is created at
// the moment of issuance (see routes/policyApproval.js's POST /:id/approve),
// ordering the outer Policy list by issue_date is equivalent to ordering by
// "earliest unaccomplished task" for the only task type that exists today,
// without needing a cross-relation sort. The Policy Applications tracker's
// own table style (columns, search/filter bar) is mirrored here.
router.get("/", validateQuery(listInLeaseBacklogQuerySchema), async (req, res, next) => {
  try {
    const { page, page_size: pageSize, search, status } = req.query;

    const where = {
      ...(search
        ? {
            OR: [
              { policy_number: { contains: search, mode: "insensitive" } },
              { customer_name_snapshot: { contains: search, mode: "insensitive" } },
              { company_name_snapshot: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      // Both directions are plain relation-filters, not a JS post-filter —
      // needed to keep pagination/total correct for a derived field.
      ...(status === "ACCOMPLISHED" ? { in_lease_backlogs: { none: { accomplished_by_user_id: null } } } : {}),
      ...(status === "PENDING" ? { in_lease_backlogs: { some: { accomplished_by_user_id: null } } } : {}),
    };

    const [total, policies] = await Promise.all([
      prisma.policy.count({ where }),
      prisma.policy.findMany({
        where,
        orderBy: { issue_date: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          policy_number: true,
          customer_name_snapshot: true,
          company_name_snapshot: true,
          class_name_snapshot: true,
          variant_name_snapshot: true,
          issue_date: true,
          in_lease_backlogs: { select: backlogSelect, orderBy: { created_at: "asc" } },
        },
      }),
    ]);

    res.json({
      data: policies.map((p) => {
        const current = currentTaskOf(p.in_lease_backlogs);
        return {
          id: p.id,
          policy_number: p.policy_number,
          insured_name: p.customer_name_snapshot || p.company_name_snapshot,
          class_name: p.class_name_snapshot,
          variant_name: p.variant_name_snapshot,
          issue_date: p.issue_date,
          status: current ? "PENDING" : "ACCOMPLISHED",
          current_task_type: current?.type || null,
        };
      }),
      total,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    next(err);
  }
});

// One policy's full in-lease detail — the "copyable format" popup (plain
// label/value rows with their own copy-to-clipboard action, not a rendered
// PDF, since the point is pasting each value into whatever external in-lease
// system Bethel uses field-by-field). Built purely off the Policy's own
// frozen *_snapshot columns (never a live join back to Vehicle/Agent/
// ProductVariant), same "an issued policy reads exactly as issued, forever"
// reasoning as pdf/policyPdf.js.
router.get("/:id", validateParams(idParamSchema), async (req, res, next) => {
  try {
    const policy = await prisma.policy.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        policy_number: true,
        coc_number: true,
        sa_number: true,
        customer_name_snapshot: true,
        company_name_snapshot: true,
        class_name_snapshot: true,
        variant_name_snapshot: true,
        agent_code_snapshot: true,
        effective_date: true,
        expiry_date: true,
        total_premium: true,
        doc_stamps: true,
        vat: true,
        lgt: true,
        misc: true,
        addresses: { select: { role: true, formatted_address_snapshot: true } },
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
            color_snapshot: true,
          },
        },
        // Every coverage line the issued policy actually carries, off the
        // same *_snapshot columns pdf/policyPdf.js's toPolicyPdfProps() reads
        // — coverage_amount is the "coverage price" (what's actually insured
        // for), premium_amount is what was charged for it.
        coverages: {
          select: { id: true, coverage_name_snapshot: true, pricing_mode_snapshot: true, coverage_amount: true, premium_amount: true },
        },
        in_lease_backlogs: {
          select: {
            ...backlogSelect,
            accomplished_by: { select: { full_name: true, email: true } },
            // Only meaningful on a FOR_ENDORSEMENT row (null FK otherwise) —
            // the endorsement whose own changes this task's copyable format
            // should show, see currentTaskEndorsement below.
            endorsement_request: {
              select: {
                endorsement_number: true,
                changes: {
                  orderBy: { created_at: "asc" },
                  select: {
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
          },
          orderBy: { created_at: "asc" },
        },
      },
    });
    if (!policy) {
      return res.status(404).json({ error: "Policy not found" });
    }

    const insuredAddress = policy.addresses.find((a) => a.role === "INSURED")?.formatted_address_snapshot || null;
    const riskAddress = policy.addresses.find((a) => a.role === "RISK")?.formatted_address_snapshot || null;
    const totalAmount =
      Number(policy.total_premium) + Number(policy.doc_stamps) + Number(policy.vat) + Number(policy.lgt) + Number(policy.misc);
    const current = currentTaskOf(policy.in_lease_backlogs);

    // Same vehicle_label/coverage_label resolution routes/endorsements.js's
    // own attachChangeLabels() does — plate number / coverage name, off this
    // policy's own snapshot rows — so describeChange() below reads the same
    // narrative the endorsement's own PDF/approval review already showed.
    const vehicleLabelById = new Map(policy.vehicles.map((v) => [v.id, v.plate_number_snapshot || v.mv_file_no_snapshot]));
    const coverageLabelById = new Map(policy.coverages.map((c) => [c.id, c.coverage_name_snapshot]));

    // Only the CURRENT (still-unaccomplished) FOR_ENDORSEMENT task's own
    // changes are surfaced here — this is what's actually being worked right
    // now, same "one task at a time" shape the checkbox/Submit action below
    // already assumes (a past, already-accomplished endorsement task has
    // nothing left to copy anywhere).
    const currentTaskEndorsement =
      current?.type === "FOR_ENDORSEMENT" && current.endorsement_request
        ? {
            endorsement_number: current.endorsement_request.endorsement_number,
            changes: current.endorsement_request.changes.map((c) => ({
              title: changeTitle(c),
              description: describeChange({
                ...c,
                vehicle_label: c.policy_vehicle_id ? vehicleLabelById.get(c.policy_vehicle_id) : null,
                coverage_label: c.policy_coverage_id ? coverageLabelById.get(c.policy_coverage_id) : null,
              }),
            })),
          }
        : null;

    res.json({
      id: policy.id,
      policy_number: policy.policy_number,
      coc_number: policy.coc_number,
      sa_number: policy.sa_number,
      insured_name: policy.customer_name_snapshot || policy.company_name_snapshot,
      insured_address: insuredAddress,
      risk_address: riskAddress,
      class_name: policy.class_name_snapshot,
      variant_name: policy.variant_name_snapshot,
      agent_code: policy.agent_code_snapshot,
      effective_date: policy.effective_date,
      expiry_date: policy.expiry_date,
      total_premium: policy.total_premium,
      doc_stamps: policy.doc_stamps,
      vat: policy.vat,
      lgt: policy.lgt,
      misc: policy.misc,
      total_amount: totalAmount,
      vehicles: policy.vehicles.map((v) => ({
        plate_number: v.plate_number_snapshot,
        mv_file_no: v.mv_file_no_snapshot,
        engine_number: v.engine_number_snapshot,
        chassis_number: v.chassis_number_snapshot,
        make: v.make_snapshot,
        model: v.model_snapshot,
        year_model: v.year_model_snapshot,
        color: v.color_snapshot,
      })),
      coverages: policy.coverages.map((c) => ({
        name: c.coverage_name_snapshot,
        pricing_mode: c.pricing_mode_snapshot,
        coverage_amount: c.coverage_amount,
        premium_amount: c.premium_amount,
      })),
      status: current ? "PENDING" : "ACCOMPLISHED",
      current_task_id: current?.id || null,
      current_task_type: current?.type || null,
      current_task_endorsement: currentTaskEndorsement,
      tasks: policy.in_lease_backlogs.map((b) => ({
        id: b.id,
        type: b.type,
        accomplished: Boolean(b.accomplished_by_user_id),
        accomplished_by_name: b.accomplished_by?.full_name || b.accomplished_by?.email || null,
        accomplished_at: b.accomplished_at,
        created_at: b.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Marks one specific task accomplished — the In-Lease Backlogs page's
// "I have duly submitted this in In-Lease" confirm-and-submit action.
// Operates on the InLeaseBacklog row's own id (returned as current_task_id
// by the two GET routes above) rather than inferring "the policy's earliest
// unaccomplished row" here, so the same endpoint stays unambiguous once
// FOR_ENDORSEMENT tasks exist alongside FOR_UPLOAD.
router.post("/:id/accomplish", requirePermission("MANAGE_INLEASE.MARK_DONE"), validateParams(idParamSchema), async (req, res, next) => {
  try {
    const backlog = await prisma.inLeaseBacklog.findUnique({ where: { id: req.params.id } });
    if (!backlog) {
      return res.status(404).json({ error: "In-lease task not found" });
    }
    if (backlog.accomplished_by_user_id) {
      return res.status(409).json({ error: "This task has already been accomplished" });
    }

    const updated = await prisma.inLeaseBacklog.update({
      where: { id: backlog.id },
      data: { accomplished_by_user_id: req.user.userId, accomplished_at: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Reverts one specific task back to unaccomplished — lets someone with
// MARK_UNDONE correct a mistaken submission. Clears both accomplished
// fields; the row's own created_at (and so its place in the "earliest
// unaccomplished" ordering) is untouched.
router.post("/:id/undo", requirePermission("MANAGE_INLEASE.MARK_UNDONE"), validateParams(idParamSchema), async (req, res, next) => {
  try {
    const backlog = await prisma.inLeaseBacklog.findUnique({ where: { id: req.params.id } });
    if (!backlog) {
      return res.status(404).json({ error: "In-lease task not found" });
    }
    if (!backlog.accomplished_by_user_id) {
      return res.status(409).json({ error: "This task hasn't been accomplished yet" });
    }

    const updated = await prisma.inLeaseBacklog.update({
      where: { id: backlog.id },
      data: { accomplished_by_user_id: null, accomplished_at: null },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
