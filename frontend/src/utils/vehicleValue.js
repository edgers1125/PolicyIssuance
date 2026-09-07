const ANNUAL_DEPRECIATION_RATE = 0.1;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// Mirrors the server's calculation purely for live preview while filling out
// the form — the server always recomputes and enforces this independently at
// submission time, so this never needs to be authoritative.
export function currentVehicleValue(estimatedValue, initialAssessmentDate, asOf = new Date()) {
  if (estimatedValue === "" || estimatedValue === null || estimatedValue === undefined || !initialAssessmentDate) {
    return null;
  }
  const yearsElapsed = Math.max(0, (asOf - new Date(initialAssessmentDate)) / MS_PER_YEAR);
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
