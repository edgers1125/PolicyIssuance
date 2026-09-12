const ANNUAL_DEPRECIATION_RATE = 0.1;

// Counts whole calendar years between two dates, anchored to the exact
// anniversary of `from` — e.g. assessed Oct 12, 2026, 2:00 PM: still 0 whole
// years elapsed at 1:59:59 PM on Oct 12, 2027, becomes 1 the instant it turns
// 2:00 PM that same day. Mirrors backend/src/lib/vehicleValue.js exactly.
function wholeYearsElapsed(from, to) {
  let years = to.getFullYear() - from.getFullYear();
  const anniversary = new Date(from);
  anniversary.setFullYear(from.getFullYear() + years);
  if (anniversary > to) {
    years -= 1;
  }
  return Math.max(0, years);
}

// Mirrors the server's calculation purely for live preview while filling out
// the form — the server always recomputes and enforces this independently at
// submission time, so this never needs to be authoritative. Value drops a
// full 10% at each whole-year anniversary of the assessment date, never
// gradually.
export function currentVehicleValue(estimatedValue, initialAssessmentDate, asOf = new Date()) {
  if (estimatedValue === "" || estimatedValue === null || estimatedValue === undefined || !initialAssessmentDate) {
    return null;
  }
  const yearsElapsed = wholeYearsElapsed(new Date(initialAssessmentDate), asOf);
  return Number(estimatedValue) * Math.pow(1 - ANNUAL_DEPRECIATION_RATE, yearsElapsed);
}

// The applicable tier is the one with the highest min_value that's still
// <= the vehicle's current value — same lookup as a tax bracket.
export function findApplicableValueTier(tiers, vehicleValue) {
  const eligible = (tiers || [])
    .filter((t) => Number(t.min_value) <= vehicleValue)
    .sort((a, b) => Number(b.min_value) - Number(a.min_value));
  return eligible[0] || null;
}
