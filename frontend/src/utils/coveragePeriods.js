// Shared label formatting for a coverage's allowable period (in days) —
// used everywhere a period picker shows up (Policy Application, Manage
// Coverage Pricing, My Agents) so the same day count always reads the same way.
export function formatPeriodLabel(days) {
  if (days === 365) return "1 year (365 days)";
  if (days === 180) return "6 months (180 days)";
  return `${days} days`;
}
