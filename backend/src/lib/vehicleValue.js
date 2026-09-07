const ANNUAL_DEPRECIATION_RATE = 0.1;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// A vehicle's insurable value depreciates 10% per year (continuously, not in
// yearly steps) from the date it was first assessed — this is what
// VALUE_PERCENTAGE coverage pricing is based on, never the frozen original
// estimate itself.
function currentVehicleValue(estimatedValue, initialAssessmentDate, asOf = new Date()) {
  if (estimatedValue === null || estimatedValue === undefined || !initialAssessmentDate) {
    return null;
  }
  const yearsElapsed = Math.max(0, (asOf - new Date(initialAssessmentDate)) / MS_PER_YEAR);
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
