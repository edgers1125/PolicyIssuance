const ANNUAL_DEPRECIATION_RATE = 0.1;

// Counts whole calendar years between two dates, anchored to the exact
// anniversary of `from` — e.g. assessed Oct 12, 2026, 2:00 PM: still 0 whole
// years elapsed at 1:59:59 PM on Oct 12, 2027, becomes 1 the instant it turns
// 2:00 PM that same day. Using real calendar-year anniversaries (rather than
// dividing by an averaged ms-per-year) also means this lands correctly across
// leap years, instead of drifting by a few hours per year.
function wholeYearsElapsed(from, to) {
  let years = to.getFullYear() - from.getFullYear();
  const anniversary = new Date(from);
  anniversary.setFullYear(from.getFullYear() + years);
  if (anniversary > to) {
    years -= 1;
  }
  return Math.max(0, years);
}

// A vehicle's insurable value drops a full 10% at each whole-year anniversary
// of its assessment date — never gradually, and never partway through a year
// — from the date it was first assessed. This is what VALUE_PERCENTAGE
// coverage pricing is based on, never the frozen original estimate itself.
function currentVehicleValue(estimatedValue, initialAssessmentDate, asOf = new Date()) {
  if (estimatedValue === null || estimatedValue === undefined || !initialAssessmentDate) {
    return null;
  }
  const yearsElapsed = wholeYearsElapsed(new Date(initialAssessmentDate), asOf);
  return Number(estimatedValue) * Math.pow(1 - ANNUAL_DEPRECIATION_RATE, yearsElapsed);
}

// The applicable tier is the one with the highest min_value that's still
// <= the vehicle's current value — same lookup logic as a tax bracket.
function findApplicableValueTier(tiers, vehicleValue) {
  const eligible = tiers
    .filter((t) => Number(t.min_value) <= vehicleValue)
    .sort((a, b) => Number(b.min_value) - Number(a.min_value));
  return eligible[0] || null;
}

module.exports = { currentVehicleValue, ANNUAL_DEPRECIATION_RATE, findApplicableValueTier };
