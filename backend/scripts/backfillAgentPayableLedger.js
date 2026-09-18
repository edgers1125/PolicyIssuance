// One-time backfill for the payable-aging columns added to
// AgentPayableTransaction (due_date, remaining_amount, applies_to_transaction_id)
// — see CLAUDE.md's "Agent payment terms + overdue payable ledger" notes and
// backend/src/lib/agentPayables.js, whose exact same rules this script
// replays against every existing row, in creation order, per agent:
//   - an ISSUANCE row opens its own bucket, due_date off the policy's own
//     issue_date + the agent's payment_terms_days.
//   - an ENDORSEMENT row with amount >= 0 (an ADD_COVERAGE credit) opens its
//     own independent bucket, due_date off the endorsement's own
//     effective_date.
//   - an ENDORSEMENT row with amount < 0 (a REMOVE_CLAUSE debit), and every
//     CANCELLED_POLICY row, claws back against that same policy's own
//     ISSUANCE bucket (whichever bucket rows have already been "opened" by
//     this point in the replay) rather than opening a new one.
//   - a PAYMENT row is allocated automatically, oldest-due-first, across
//     whatever buckets are already open at that point in the replay.
//
// Run once, after applying the 20260917222542_agent_payable_aging migration:
//   docker exec policyissuance-backend-1 node scripts/backfillAgentPayableLedger.js
//
// Idempotent-ish in that re-running it recomputes every row from scratch
// (it doesn't read the columns it's writing), so it's safe to re-run after
// fixing a bug in this script itself — just not safe to run again after any
// *new* transactions have been recorded by the live app in the meantime,
// since those already carry correct values of their own.
const prisma = require("../src/lib/prisma");
const { computeDueDate } = require("../src/lib/agentPayables");

async function main() {
  const agents = await prisma.agent.findMany({ select: { id: true, payment_terms_days: true } });

  for (const agent of agents) {
    const transactions = await prisma.agentPayableTransaction.findMany({
      where: { agent_id: agent.id },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        transaction_type: true,
        amount: true,
        policy_id: true,
        endorsement_request_id: true,
      },
    });
    if (transactions.length === 0) continue;

    const policyIds = [...new Set(transactions.map((t) => t.policy_id).filter(Boolean))];
    const policies = await prisma.policy.findMany({
      where: { id: { in: policyIds } },
      select: { id: true, issue_date: true },
    });
    const policyIssueDateById = new Map(policies.map((p) => [p.id, p.issue_date]));

    const endorsementIds = [...new Set(transactions.map((t) => t.endorsement_request_id).filter(Boolean))];
    const endorsements = await prisma.endorsementRequest.findMany({
      where: { id: { in: endorsementIds } },
      select: { id: true, effective_date: true },
    });
    const endorsementEffectiveDateById = new Map(endorsements.map((e) => [e.id, e.effective_date]));

    // Buckets "opened" so far in this replay, in chronological order —
    // exactly what a REMOVE_CLAUSE/CANCELLED_POLICY debit or a PAYMENT can
    // actually see/settle at that point in time.
    const openBuckets = []; // { id, policy_id, remaining_amount, due_date }
    const updates = []; // { id, data }

    for (const tx of transactions) {
      const amount = Number(tx.amount);

      if (tx.transaction_type === "ISSUANCE") {
        const issueDate = policyIssueDateById.get(tx.policy_id) || new Date();
        const dueDate = computeDueDate(issueDate, agent.payment_terms_days);
        const bucket = { id: tx.id, policy_id: tx.policy_id, remaining_amount: amount, due_date: dueDate };
        openBuckets.push(bucket);
        updates.push({ id: tx.id, data: { due_date: dueDate, remaining_amount: amount } });
      } else if (tx.transaction_type === "ENDORSEMENT" && amount >= 0) {
        const effectiveDate = endorsementEffectiveDateById.get(tx.endorsement_request_id) || new Date();
        const dueDate = computeDueDate(effectiveDate, agent.payment_terms_days);
        const bucket = { id: tx.id, policy_id: tx.policy_id, remaining_amount: amount, due_date: dueDate };
        openBuckets.push(bucket);
        updates.push({ id: tx.id, data: { due_date: dueDate, remaining_amount: amount } });
      } else if (tx.transaction_type === "ENDORSEMENT" || tx.transaction_type === "CANCELLED_POLICY") {
        // A debit clawing back against its own policy's own ISSUANCE bucket.
        const issuanceBucket = openBuckets.find((b) => b.policy_id === tx.policy_id && b.id !== tx.id);
        if (issuanceBucket) {
          issuanceBucket.remaining_amount -= Math.abs(amount);
          updates.push({ id: tx.id, data: { applies_to_transaction_id: issuanceBucket.id } });
        }
      } else if (tx.transaction_type === "PAYMENT") {
        let remainingToApply = Math.abs(amount);
        if (openBuckets.length > 0) {
          const sorted = [...openBuckets].sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return a.due_date.getTime() - b.due_date.getTime();
          });
          let lastTouched = sorted[sorted.length - 1];
          for (const bucket of sorted) {
            if (remainingToApply <= 0) break;
            if (bucket.remaining_amount <= 0) continue;
            const applied = Math.min(remainingToApply, bucket.remaining_amount);
            bucket.remaining_amount -= applied;
            remainingToApply -= applied;
            lastTouched = bucket;
          }
          if (remainingToApply > 0 && lastTouched) {
            lastTouched.remaining_amount -= remainingToApply;
          }
        }
      }
    }

    // Bucket rows' remaining_amount may have been decremented after their
    // own update was already queued above (by a later debit/payment in the
    // same loop) — re-sync every queued bucket update to its final value,
    // and apply any bucket update whose remaining_amount never changed
    // (already correct) alongside every debit's own applies_to_transaction_id.
    const finalRemainingByBucketId = new Map(openBuckets.map((b) => [b.id, b.remaining_amount]));
    for (const u of updates) {
      if (finalRemainingByBucketId.has(u.id)) {
        u.data.remaining_amount = finalRemainingByBucketId.get(u.id);
      }
    }

    for (const u of updates) {
      await prisma.agentPayableTransaction.update({ where: { id: u.id }, data: u.data });
    }

    console.log(`Agent ${agent.id}: backfilled ${updates.length} transaction(s).`);
  }

  console.log("Backfill complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
