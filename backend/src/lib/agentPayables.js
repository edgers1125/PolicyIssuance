const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A "bucket" row is one that opens its own outstanding balance with its own
// due date: an ISSUANCE row, or an ENDORSEMENT row credited by an
// ADD_COVERAGE line. An ENDORSEMENT row is only a bucket when its amount is
// >= 0 — a negative-amount ENDORSEMENT row is a REMOVE_CLAUSE debit that
// claws back against the policy's own original bucket instead of opening a
// new one (see applyDebitToOriginalBucket below) — the same sign convention
// routes/endorsements.js's own POST /:id/approve already relies on (an
// ADD_COVERAGE line's own payable_to_bethel is always >= 0; a REMOVE_CLAUSE
// line's own debit is always <= 0).
function isBucketTransactionType(transactionType, amount) {
  if (transactionType === "ISSUANCE") return true;
  if (transactionType === "ENDORSEMENT") return Number(amount) >= 0;
  return false;
}

// basisDate + paymentTermsDays, computed once at a bucket row's own creation
// and frozen forever after that — see AgentPayableTransaction.due_date's own
// schema comment.
function computeDueDate(basisDate, paymentTermsDays) {
  return new Date(new Date(basisDate).getTime() + paymentTermsDays * MS_PER_DAY);
}

// Locates the given policy's own ISSUANCE row and decrements its
// remaining_amount by debitAmount (a positive number) — used by a
// REMOVE_CLAUSE-debit ENDORSEMENT row and by a CANCELLED_POLICY row, both of
// which claw back against the policy's original bucket (using that bucket's
// own due date) rather than opening a new one of their own. Unbounded: the
// bucket's remaining_amount can go negative when the clawback exceeds what
// was still outstanding on it — meaning the agent had already been paid
// past what's now actually owed, and the negative balance is what they owe
// back. Returns the policy's own ISSUANCE row id (for applies_to_transaction_id)
// or null if that policy somehow has no ISSUANCE row on file.
async function applyDebitToOriginalBucket(tx, policyId, debitAmount) {
  const issuance = await tx.agentPayableTransaction.findFirst({
    where: { policy_id: policyId, transaction_type: "ISSUANCE" },
    select: { id: true, remaining_amount: true },
  });
  if (!issuance) return null;
  await tx.agentPayableTransaction.update({
    where: { id: issuance.id },
    data: { remaining_amount: Number(issuance.remaining_amount || 0) - debitAmount },
  });
  return issuance.id;
}

// Applies a manual PAYMENT of paymentAmount (a positive number — how much
// was actually paid out) across this agent's own bucket rows, oldest-due-
// first (rows with no due date sort last), decrementing remaining_amount on
// each in turn until the payment is exhausted. If the payment outlasts
// every bucket's own positive remaining balance, the leftover is applied to
// the last bucket touched (or, if none had anything left to pay down, the
// single oldest bucket), letting it go negative on overpayment — e.g. a
// policy's 5,000 ISSUANCE bucket debited 1,500 by a coverage-removal
// endorsement (down to 3,500 remaining) then paid a flat 5,000 ends up at
// -1,500: the extra 1,500 the agent was overpaid, still "mapped to that
// transaction."
async function allocatePaymentFifo(tx, agentId, paymentAmount) {
  const buckets = await tx.agentPayableTransaction.findMany({
    where: {
      agent_id: agentId,
      OR: [{ transaction_type: "ISSUANCE" }, { transaction_type: "ENDORSEMENT", amount: { gte: 0 } }],
    },
    select: { id: true, remaining_amount: true },
    orderBy: [{ due_date: { sort: "asc", nulls: "last" } }, { created_at: "asc" }],
  });
  if (buckets.length === 0) return;

  let remainingToApply = paymentAmount;
  let lastTouchedId = buckets[buckets.length - 1].id;
  for (const bucket of buckets) {
    if (remainingToApply <= 0) break;
    const bucketRemaining = Number(bucket.remaining_amount || 0);
    if (bucketRemaining <= 0) continue;
    const applied = Math.min(remainingToApply, bucketRemaining);
    await tx.agentPayableTransaction.update({
      where: { id: bucket.id },
      data: { remaining_amount: bucketRemaining - applied },
    });
    remainingToApply -= applied;
    lastTouchedId = bucket.id;
  }
  if (remainingToApply > 0) {
    const last = await tx.agentPayableTransaction.findUnique({
      where: { id: lastTouchedId },
      select: { remaining_amount: true },
    });
    await tx.agentPayableTransaction.update({
      where: { id: lastTouchedId },
      data: { remaining_amount: Number(last.remaining_amount || 0) - remainingToApply },
    });
  }
}

// The Accounting Overview's own Total/Overdue Payable Balance split — one
// pass over every agent's bucket rows (see isBucketTransactionType above).
// totalPayable should already equal Agent.payable (the denormalized cache
// every ledger write also keeps in sync); computed independently here off
// remaining_amount rather than trusted blind, since it's what's actually
// being displayed. overduePayable is the same sum restricted to buckets
// whose own due_date has already passed.
async function computeAgentPayableBalances(prisma) {
  const buckets = await prisma.agentPayableTransaction.findMany({
    where: {
      OR: [{ transaction_type: "ISSUANCE" }, { transaction_type: "ENDORSEMENT", amount: { gte: 0 } }],
    },
    select: { agent_id: true, remaining_amount: true, due_date: true },
  });
  const now = new Date();
  const totalsByAgentId = new Map();
  for (const row of buckets) {
    const totals = totalsByAgentId.get(row.agent_id) || { totalPayable: 0, overduePayable: 0 };
    const remaining = Number(row.remaining_amount || 0);
    totals.totalPayable += remaining;
    if (row.due_date && row.due_date <= now) {
      totals.overduePayable += remaining;
    }
    totalsByAgentId.set(row.agent_id, totals);
  }
  return totalsByAgentId;
}

module.exports = {
  isBucketTransactionType,
  computeDueDate,
  applyDebitToOriginalBucket,
  allocatePaymentFifo,
  computeAgentPayableBalances,
};
