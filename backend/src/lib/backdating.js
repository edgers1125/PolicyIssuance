const { HttpError } = require("./httpError");

// Permissions that let a caller file/edit a quotation or policy application
// with a coverage_start_at before today — trusted admin-tier staff who route
// around this guardrail on a regular agent's behalf (e.g. correcting a
// filing that should have gone in earlier). Holding ANY one of these three
// is enough to override, regardless of which specific action (quotation vs.
// application) they're taking — routes/policyApproval.js's own
// POST /admin-applications is gated on APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION
// at the route level already, so reaching it at all already implies this.
const BACKDATE_OVERRIDE_PERMISSIONS = [
  "QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION",
  "APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION",
  "VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT",
];

function canOverrideBackdating(actingPermissions) {
  return BACKDATE_OVERRIDE_PERMISSIONS.some((p) => actingPermissions.has(p));
}

// A regular agent can never file or edit a quotation/policy application with
// a coverage_start_at before today — only an admin-tier caller (see
// BACKDATE_OVERRIDE_PERMISSIONS, or allowBackdating passed in true by a
// route that's already gated on one of them) can backdate one. "Today" is
// midnight UTC, matching how coverage_start_at is always parsed elsewhere in
// this app (the container sets no TZ, so z.coerce.date() resolves a naive
// datetime-local string in UTC — see CLAUDE.md's own note on this).
function assertCoverageStartNotBackdated(coverageStartAt, { actingPermissions, allowBackdating = false } = {}) {
  if (allowBackdating || (actingPermissions && canOverrideBackdating(actingPermissions))) return;
  const todayFloor = new Date();
  todayFloor.setUTCHours(0, 0, 0, 0);
  if (new Date(coverageStartAt) < todayFloor) {
    throw new HttpError(400, "coverage_start_at cannot be before today");
  }
}

module.exports = { BACKDATE_OVERRIDE_PERMISSIONS, canOverrideBackdating, assertCoverageStartNotBackdated };
