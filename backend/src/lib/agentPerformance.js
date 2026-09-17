const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Every agent's own premium production — all-time and last-30-days — off
// ApplicationCoverage.payable_to_bethel (frozen at submission time, never
// recomputed off a later rate change). Shared by routes/agents.js's own
// GET / (My Agents' premium columns) and routes/accounting.js's GET /overview
// (the Accounting page's own agent-performance table), so the one
// aggregation query/loop can't drift between the two call sites.
async function computeAgentPremiumTotals(prisma) {
  const coverageRows = await prisma.applicationCoverage.findMany({
    select: {
      payable_to_bethel: true,
      application: { select: { agent_id: true, application_date: true } },
    },
  });

  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
  const totalsByAgentId = new Map();
  for (const row of coverageRows) {
    const agentId = row.application.agent_id;
    const branchAmount = Number(row.payable_to_bethel);
    const totals = totalsByAgentId.get(agentId) || { allTime: 0, last30Days: 0 };
    totals.allTime += branchAmount;
    if (row.application.application_date >= thirtyDaysAgo) {
      totals.last30Days += branchAmount;
    }
    totalsByAgentId.set(agentId, totals);
  }
  return totalsByAgentId;
}

module.exports = { computeAgentPremiumTotals };
