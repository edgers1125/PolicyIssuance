const { z } = require("zod");

// Mirrors the Prisma enum of the same name — kept as a plain array (same
// "no generated-enum import" precedent as schemas/policyApplications.js's
// own APPLICATION_STATUSES) so schema files never need the generated client.
const AGENT_PAYABLE_TRANSACTION_TYPES = ["ISSUANCE", "ENDORSEMENT", "CANCELLED_POLICY", "PAYMENT"];

// GET /accounting/transactions — same shape/cap as every other tracker list.
const listPayableTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  page_size: z.coerce.number().int().positive().max(100).optional().default(20),
  // Matched against the filing agent's own code/name and, when set, the
  // related policy's own number.
  search: z.string().trim().optional(),
  transaction_type: z.enum(AGENT_PAYABLE_TRANSACTION_TYPES).optional(),
  agent_id: z.string().uuid("agent_id must be a valid UUID").optional(),
});

// POST /accounting/payments — the only client-facing way to create an
// AgentPayableTransaction today. `transaction_type` is deliberately not
// accepted here — always "PAYMENT", set server-side — since ISSUANCE is
// computed at policy approval and ENDORSEMENT/CANCELLED_POLICY have no
// creation path yet at all (see that enum's own schema comment in
// enums.prisma). `amount` is entered as a plain positive number — how much
// was actually paid out — and the route negates it before storing, since a
// PAYMENT row must debit the ledger (amount <= 0, enforced again by a DB
// CHECK constraint on AgentPayableTransaction as the last line of defense
// for any future writer that bypasses this schema).
const recordPaymentSchema = z.object({
  agent_id: z.string().uuid("agent_id must be a valid UUID"),
  amount: z.coerce.number().positive("amount must be greater than 0"),
  remarks: z.string().trim().max(1000, "remarks must be at most 1000 characters").optional(),
});

module.exports = {
  AGENT_PAYABLE_TRANSACTION_TYPES,
  listPayableTransactionsQuerySchema,
  recordPaymentSchema,
};
