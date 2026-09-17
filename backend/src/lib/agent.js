const prisma = require("./prisma");

// Every user account that files applications is linked to an agent profile —
// this resolves that link so routes can scope data to "this agent's own".
async function getCurrentAgentId(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { agent_id: true },
  });
  return user?.agent_id || null;
}

// Every agent id a `CompanyAgent`/`CustomerAgent` ownership check should
// consider for this one individual — their own id, plus (if they're an
// employee of a CORPORATE agency, via Agent.company_id) that agency's own id
// too. This is what lets a CORPORATE agent's own Agent.linked_company_id
// (see routes/agents.js's POST /) show up as a selectable insured party for
// every individual under that agency, not just whoever happened to create
// the link — a CompanyAgent row is created against the agency's own id (a
// CORPORATE agent never logs in to use it directly), so any query scoped to
// just the caller's own agent_id would otherwise never see it.
async function getAccessibleAgentIds(agentId) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { company_id: true } });
  return agent?.company_id ? [agentId, agent.company_id] : [agentId];
}

module.exports = { getCurrentAgentId, getAccessibleAgentIds };
