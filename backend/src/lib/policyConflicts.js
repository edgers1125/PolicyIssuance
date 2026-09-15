// Enforces the "no double-insuring the same asset" rule when a quotation is
// submitted as a policy application: a Motor quotation's vehicle(s), or a
// Property quotation's risk address, must not already be covered by a live
// application or an overlapping active policy. Shared by
// policyQuotations.js's submit route — split out since it's a standalone
// business rule, not part of coverage pricing (lib/coveragePricing.js).
//
// Two independent conditions, either of which blocks:
//  1. An ACTIVE policy already on file for the same vehicle/address whose
//     own [effective_date, expiry_date] overlaps the new quotation's
//     [coverage_start_at, coverage_end_at] — a policy that already expired
//     before this one starts (or hasn't started yet and won't overlap) is
//     no conflict at all, so this is a date-range check, not "any active
//     policy ever".
//  2. A policy application for the same vehicle/address that's still
//     pending approval (anything before APPROVED/REJECTED) — unresolved
//     regardless of what dates it asked for, since approval could still
//     land it on dates that would overlap. APPROVED isn't included here:
//     an approved application always has a corresponding Policy row (see
//     Policy.application_id), so condition 1 (the date-range check) is what
//     actually governs it from that point on, not this one.
const prisma = require("./prisma");
const { HttpError } = require("./httpError");

const PENDING_APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "FOR_EDIT_MANAGER",
  "FOR_EDIT_UNDERWRITING",
  "PENDING_MANAGER_APPROVAL",
  "PENDING_UNDERWRITING_APPROVAL",
];

async function assertVehiclesFree(vehicleIds, coverageStartAt, coverageEndAt) {
  if (!vehicleIds || vehicleIds.length === 0) return;

  const appConflict = await prisma.policyApplicationVehicle.findFirst({
    where: {
      vehicle_id: { in: vehicleIds },
      policy_application: { status: { in: PENDING_APPLICATION_STATUSES } },
    },
    select: {
      vehicle: { select: { plate_number: true } },
      policy_application: { select: { application_number: true } },
    },
  });
  if (appConflict) {
    throw new HttpError(
      409,
      `Vehicle ${appConflict.vehicle.plate_number || "on this quotation"} already has a policy application pending approval (${appConflict.policy_application.application_number})`
    );
  }

  // Overlap test: two half-open intervals [a_start, a_end) and
  // [b_start, b_end) overlap exactly when a_start < b_end AND b_start < a_end.
  const policyConflict = await prisma.policyVehicle.findFirst({
    where: {
      vehicle_id: { in: vehicleIds },
      policy: {
        policy_status: "ACTIVE",
        effective_date: { lt: coverageEndAt },
        expiry_date: { gt: coverageStartAt },
      },
    },
    select: {
      vehicle: { select: { plate_number: true } },
      policy: { select: { policy_number: true, effective_date: true, expiry_date: true } },
    },
  });
  if (policyConflict) {
    throw new HttpError(
      409,
      `Vehicle ${policyConflict.vehicle.plate_number || "on this quotation"} already has an active policy (${policyConflict.policy.policy_number}) covering an overlapping period`
    );
  }
}

// Property's "risk address" (the insured location itself) is the asset that
// can't be double-insured — unlike the insured party's own mailing address,
// which can legitimately repeat across many unrelated policies.
async function assertRiskAddressFree(addressId, coverageStartAt, coverageEndAt) {
  if (!addressId) return;

  const appConflict = await prisma.policyApplicationAddress.findFirst({
    where: {
      address_id: addressId,
      role: "RISK",
      policy_application: { status: { in: PENDING_APPLICATION_STATUSES } },
    },
    select: { policy_application: { select: { application_number: true } } },
  });
  if (appConflict) {
    throw new HttpError(
      409,
      `This risk address already has a policy application pending approval (${appConflict.policy_application.application_number})`
    );
  }

  const policyConflict = await prisma.policyAddress.findFirst({
    where: {
      address_id: addressId,
      role: "RISK",
      policy: {
        policy_status: "ACTIVE",
        effective_date: { lt: coverageEndAt },
        expiry_date: { gt: coverageStartAt },
      },
    },
    select: { policy: { select: { policy_number: true } } },
  });
  if (policyConflict) {
    throw new HttpError(
      409,
      `This risk address already has an active policy (${policyConflict.policy.policy_number}) covering an overlapping period`
    );
  }
}

module.exports = { assertVehiclesFree, assertRiskAddressFree };
