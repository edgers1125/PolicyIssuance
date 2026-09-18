// Enforces the "no double-insuring the same asset" rule, and auto-detects
// when a vehicle/risk address already has policy history so the resulting
// application/quotation can be linked as a renewal instead of filed as a
// disconnected NEW_POLICY — see PolicyApplication.renewed_policy_id and
// PolicyQuotation.renewed_policy_id. Deliberately global (not scoped to the
// caller's own agent or the insured party): a specific physical vehicle or
// risk address can only ever be validly covered by one policy at a time,
// and its history follows the asset regardless of which agent or customer
// is now applying for it.
//
// Two independent conditions:
//  1. A policy application for the same vehicle/address that's still
//     pending approval (anything before APPROVED/REJECTED) — an
//     unconditional block regardless of what dates it asked for, since
//     approval could still land it on dates that would overlap. There's no
//     "renew" path out of this one: an unresolved pending application has
//     no known final dates to renew from. APPROVED isn't included here: an
//     approved application always has a corresponding Policy row (see
//     Policy.application_id), so condition 2 is what governs it from then on.
//  2. The single most-recently-issued Policy already on file for the same
//     vehicle/address (if any), regardless of status. When enforcing (the
//     default, and every current caller — creating or editing an
//     application or a quotation, or submitting a quotation into one), an
//     ACTIVE policy whose own expiry_date is on or after the new coverage's
//     start blocks outright: coverage must start on or after that date. A
//     policy that's already EXPIRED/CANCELLED/LAPSED never blocks, but is
//     still surfaced as the renewal target so continuity is tracked. The
//     `enforce` option still exists for a caller that only wants to compute
//     (never throw on) this — no current caller passes `enforce: false`,
//     but a quotation's own creation/edit once did, before it was made to
//     enforce the same as an application; see routes/policyQuotations.js's
//     own comment for why.
const prisma = require("./prisma");
const { HttpError } = require("./httpError");

const PENDING_APPLICATION_STATUSES = ["SUBMITTED", "UNDER_REVIEW"];

// Groups a list of {key, policy} rows (already ordered latest-issued-first)
// down to one (the latest) per key — used for both vehicles (keyed by
// vehicle_id, since a Motor application can carry more than one) and would
// work identically for addresses if there were ever more than one.
function latestPerKey(rows, keyOf) {
  const byKey = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return byKey;
}

// vehicleIds: every Vehicle.id on the application/quotation (Motor only).
// Returns { renewedPolicyId } — the single Policy to link as this
// application/quotation's renewal target, or null only if none of the
// vehicles has any policy history at all. Under no circumstance is an
// application/quotation left as a NEW_POLICY once at least one vehicle on it
// has prior history — when more than one distinct policy is found across a
// multi-vehicle application (the schema only has room for one
// renewed_policy_id), the most recently issued one wins rather than
// silently discarding the link; each vehicle's own active-policy date rule
// below still applies independently regardless of which one was picked.
//
// excludeApplicationId: passed by routes/policyApproval.js's POST /:id/approve,
// which re-runs this same check at approval time — without it, the
// application being approved would flag itself as its own "pending
// application" conflict (condition 1), since it's still in a pre-APPROVED
// status at the moment this runs.
async function resolveVehicleRenewal(
  vehicleIds,
  coverageStartAt,
  coverageEndAt,
  { enforce = true, excludeApplicationId = null } = {}
) {
  if (!vehicleIds || vehicleIds.length === 0) return { renewedPolicyId: null };

  if (enforce) {
    const appConflict = await prisma.policyApplicationVehicle.findFirst({
      where: {
        vehicle_id: { in: vehicleIds },
        policy_application: {
          status: { in: PENDING_APPLICATION_STATUSES },
          ...(excludeApplicationId ? { id: { not: excludeApplicationId } } : {}),
        },
      },
      select: {
        vehicle: { select: { plate_number: true } },
        policy_application: { select: { application_number: true } },
      },
    });
    if (appConflict) {
      throw new HttpError(
        409,
        `Vehicle ${appConflict.vehicle.plate_number || "on this application"} already has a policy application pending approval (${appConflict.policy_application.application_number})`
      );
    }
  }

  const policyVehicles = await prisma.policyVehicle.findMany({
    where: { vehicle_id: { in: vehicleIds } },
    select: {
      vehicle_id: true,
      vehicle: { select: { plate_number: true } },
      policy: { select: { id: true, policy_number: true, policy_status: true, effective_date: true, expiry_date: true } },
    },
    orderBy: { policy: { effective_date: "desc" } },
  });
  const latestByVehicle = latestPerKey(policyVehicles, (r) => r.vehicle_id);

  if (enforce) {
    for (const row of latestByVehicle.values()) {
      if (row.policy.policy_status === "ACTIVE" && new Date(coverageStartAt) < row.policy.expiry_date) {
        throw new HttpError(409, {
          error: `Vehicle ${row.vehicle.plate_number || "on this application"} already has an active policy (${row.policy.policy_number}) until ${row.policy.expiry_date.toISOString().slice(0, 10)} — coverage must start on or after that date. File this as a renewal of that policy instead.`,
          // Lets the caller offer a direct "renew this policy" action instead
          // of a dead-end error — see PolicyApplication.jsx's onRenewalRequested.
          conflict: { policy_id: row.policy.id, policy_number: row.policy.policy_number, expiry_date: row.policy.expiry_date },
        });
      }
    }
  }

  const distinctPolicies = [...new Map([...latestByVehicle.values()].map((r) => [r.policy.id, r.policy])).values()];
  if (distinctPolicies.length === 0) return { renewedPolicyId: null };
  // More than one distinct policy across the vehicle list — pick the most
  // recently issued as the link rather than giving up on renewal tracking
  // entirely (see this function's own comment above).
  distinctPolicies.sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
  return { renewedPolicyId: distinctPolicies[0].id };
}

// Property's "risk address" (the insured location itself) is the asset that
// can't be double-insured — unlike the insured party's own mailing address,
// which can legitimately repeat across many unrelated policies. Only ever
// catches a conflict/renewal when the agent actually reused the same on-file
// Address row — Address has no natural key (unlike Vehicle's unique
// mv_file_no/engine_number/chassis_number), so a re-typed "new" address for
// the same physical property is invisible to this check. Accepted as a
// known gap rather than solved with fuzzy text matching.
async function resolveRiskAddressRenewal(
  addressId,
  coverageStartAt,
  coverageEndAt,
  { enforce = true, excludeApplicationId = null } = {}
) {
  if (!addressId) return { renewedPolicyId: null };

  if (enforce) {
    const appConflict = await prisma.policyApplicationAddress.findFirst({
      where: {
        address_id: addressId,
        role: "RISK",
        policy_application: {
          status: { in: PENDING_APPLICATION_STATUSES },
          ...(excludeApplicationId ? { id: { not: excludeApplicationId } } : {}),
        },
      },
      select: { policy_application: { select: { application_number: true } } },
    });
    if (appConflict) {
      throw new HttpError(
        409,
        `This risk address already has a policy application pending approval (${appConflict.policy_application.application_number})`
      );
    }
  }

  const policyAddress = await prisma.policyAddress.findFirst({
    where: { address_id: addressId, role: "RISK" },
    select: { policy: { select: { id: true, policy_number: true, policy_status: true, effective_date: true, expiry_date: true } } },
    orderBy: { policy: { effective_date: "desc" } },
  });

  if (enforce && policyAddress && policyAddress.policy.policy_status === "ACTIVE" && new Date(coverageStartAt) < policyAddress.policy.expiry_date) {
    throw new HttpError(409, {
      error: `This risk address already has an active policy (${policyAddress.policy.policy_number}) until ${policyAddress.policy.expiry_date.toISOString().slice(0, 10)} — coverage must start on or after that date. File this as a renewal of that policy instead.`,
      conflict: {
        policy_id: policyAddress.policy.id,
        policy_number: policyAddress.policy.policy_number,
        expiry_date: policyAddress.policy.expiry_date,
      },
    });
  }

  return { renewedPolicyId: policyAddress ? policyAddress.policy.id : null };
}

module.exports = { resolveVehicleRenewal, resolveRiskAddressRenewal };
