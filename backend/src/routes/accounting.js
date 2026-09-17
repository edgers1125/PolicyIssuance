const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateBody, validateQuery } = require("../middleware/validate");
const { listPayableTransactionsQuerySchema, recordPaymentSchema } = require("../schemas/agentPayables");
const { computeAgentPremiumTotals } = require("../lib/agentPerformance");

const router = express.Router();

// MANAGE_ACCOUNTING is page access + view (both tabs below); the one
// mutating route needs its own more specific grant on top —
// MANAGE_ACCOUNTING.RECORD_PAYMENT — same "page access isn't write access"
// pattern as CREATE_APPLICATION/CREATE_APPLICATION.AGENT_ISSUANCE elsewhere
// in this app.
router.use(requireAuth, requirePermission("MANAGE_ACCOUNTING"));

// The Accounting page's "Overview" tab (the page's own default/first tab) —
// one row per agent: identity, premium production (the same computation
// routes/agents.js's own GET / uses for My Agents' premium columns — see
// lib/agentPerformance.js, shared so the two can never disagree), and the
// agent's current payable balance. Reads Agent.payable directly — a
// denormalized running total kept in sync by every AgentPayableTransaction
// write (see that column's own schema comment) — rather than summing the
// whole ledger live, specifically so this page stays fast regardless of how
// long an agent's own transaction history grows; the ledger itself
// (GET /transactions below) remains the source of truth for auditing.
router.get("/overview", async (req, res, next) => {
  try {
    const [agents, totalsByAgentId] = await Promise.all([
      prisma.agent.findMany({
        orderBy: { agent_name: "asc" },
        select: { id: true, agent_code: true, agent_name: true, agent_type: true, payable: true },
      }),
      computeAgentPremiumTotals(prisma),
    ]);

    res.json(
      agents.map((a) => ({
        id: a.id,
        agent_code: a.agent_code,
        agent_name: a.agent_name,
        agent_type: a.agent_type,
        payable: a.payable,
        premiums_generated: totalsByAgentId.get(a.id)?.allTime || 0,
        premiums_generated_30d: totalsByAgentId.get(a.id)?.last30Days || 0,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// The Accounting page's "Transactions" tab — every AgentPayableTransaction in
// the system, from every agent, newest first (a plain audit-log sort —
// unlike Policy Approval/Endorsement Approval, there's no "pending vs
// decided" concept here, every row is already a settled ledger entry).
// Optional search/transaction_type/agent_id narrow the where — search
// matches the agent's own code/name and, when one exists on the row, the
// related policy's own number.
router.get("/transactions", validateQuery(listPayableTransactionsQuerySchema), async (req, res, next) => {
  try {
    const { page, page_size: pageSize, search, transaction_type, agent_id } = req.query;
    const where = {
      ...(transaction_type ? { transaction_type } : {}),
      ...(agent_id ? { agent_id } : {}),
      ...(search
        ? {
            OR: [
              { agent: { agent_code: { contains: search, mode: "insensitive" } } },
              { agent: { agent_name: { contains: search, mode: "insensitive" } } },
              { policy: { policy_number: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.agentPayableTransaction.count({ where }),
      prisma.agentPayableTransaction.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          transaction_type: true,
          amount: true,
          remarks: true,
          created_at: true,
          agent: { select: { agent_code: true, agent_name: true } },
          policy: { select: { policy_number: true } },
          created_by_user: { select: { full_name: true, email: true } },
        },
      }),
    ]);

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        transaction_type: r.transaction_type,
        amount: r.amount,
        remarks: r.remarks,
        created_at: r.created_at,
        agent_code: r.agent.agent_code,
        agent_name: r.agent.agent_name,
        policy_number: r.policy?.policy_number || null,
        created_by_name: r.created_by_user?.full_name || r.created_by_user?.email || null,
      })),
      total,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    next(err);
  }
});

// Records a manual payment against an agent's payable balance — the only
// client-facing way to create an AgentPayableTransaction (see
// recordPaymentSchema's own note on why transaction_type isn't accepted
// here). Debits both the ledger (a negative PAYMENT row) and Agent.payable's
// own cached running total in one transaction, so the two can never drift
// apart.
router.post(
  "/payments",
  requirePermission("MANAGE_ACCOUNTING.RECORD_PAYMENT"),
  validateBody(recordPaymentSchema),
  async (req, res, next) => {
    try {
      const { agent_id, amount, remarks } = req.body;
      const agent = await prisma.agent.findUnique({ where: { id: agent_id }, select: { id: true } });
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      const signedAmount = -amount;
      const [transaction] = await prisma.$transaction([
        prisma.agentPayableTransaction.create({
          data: {
            agent_id,
            transaction_type: "PAYMENT",
            amount: signedAmount,
            remarks: remarks || null,
            created_by_user_id: req.user.userId,
          },
        }),
        prisma.agent.update({ where: { id: agent_id }, data: { payable: { increment: signedAmount } } }),
      ]);

      res.status(201).json(transaction);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
