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

module.exports = { getCurrentAgentId };
