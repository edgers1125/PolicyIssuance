// Fetches one page of a two-bucket "priority list" without loading the whole
// table into memory — used by routes/policyApproval.js's GET / (Policy
// Approval) and routes/endorsements.js's GET / (Endorsement Approval), where
// a still-undecided row must always outrank an already-decided one,
// regardless of either bucket's own dates. Prisma's declarative `orderBy`
// can't express "ascending within the pending bucket, descending within the
// decided bucket" in a single call, so this issues a count() against the
// pending bucket and then one or two findMany() calls (the pending bucket
// first, the decided bucket only if the requested page needs to reach past
// it), with skip/take arithmetic that treats the two buckets as one
// virtually-concatenated list — the same result a single UNION ALL query
// with a priority column would give, without needing raw SQL.
async function fetchByPriority({ delegate, pendingWhere, decidedWhere, pendingOrderBy, decidedOrderBy, select, skip, take }) {
  const pendingCount = await delegate.count({ where: pendingWhere });
  const rows = [];

  if (skip < pendingCount) {
    const pendingTake = Math.min(take, pendingCount - skip);
    rows.push(...(await delegate.findMany({ where: pendingWhere, orderBy: pendingOrderBy, select, skip, take: pendingTake })));
  }

  const remaining = take - rows.length;
  if (remaining > 0) {
    const decidedSkip = Math.max(0, skip - pendingCount);
    rows.push(
      ...(await delegate.findMany({ where: decidedWhere, orderBy: decidedOrderBy, select, skip: decidedSkip, take: remaining }))
    );
  }

  return rows;
}

module.exports = { fetchByPriority };
