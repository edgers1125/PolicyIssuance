// Mirrors backend/src/lib/backdating.js exactly — a regular agent can never
// file/edit a quotation or policy application with a coverage_start_at
// before today; holding any one of these lets them override it. Purely a
// UX guardrail (native `min` + a pre-submit check) — the server enforces
// this independently and always wins.
export const BACKDATE_OVERRIDE_PERMISSIONS = [
  "QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION",
  "APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION",
  "VIEW_POLICIES.ADMIN_CREATE_ENDORSEMENT",
];

export function canOverrideBackdating(permissions) {
  return Boolean(permissions?.some((p) => BACKDATE_OVERRIDE_PERMISSIONS.includes(p)));
}

// "Today" at local midnight, in the same "YYYY-MM-DDTHH:mm" shape a
// <input type="datetime-local"> takes/returns — matches how coverageStartAt
// itself is always stored as a plain local-datetime string in these forms.
export function todayFloorLocal() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00`;
}
