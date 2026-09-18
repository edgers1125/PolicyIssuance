// One-off dev/test reset — wipes every transactional/identity table (users,
// roles, agents, parties, vehicles, addresses, quotations, applications,
// policies, endorsements, in-lease backlogs, the payable ledger) while
// deliberately leaving the Permission catalog and the product/pricing
// catalog (InsuranceClass/ProductVariant/ProductCoverage/CoverageAllowablePeriod
// and their default pricing tables) and AuthorizedPaymentMethod untouched,
// then recreates exactly one "System Administrator" role (every existing
// Permission granted) and one login for it. Not wired into any route/script
// npm runs automatically — invoked manually, once, for this exact request.
const bcrypt = require("bcrypt");
const prisma = require("../src/lib/prisma");

const WIPE_TABLES = [
  "Address",
  "Agent",
  "AgentFlatTierPricing",
  "AgentNetrate",
  "AgentPayableTransaction",
  "AgentSeatsBasedPricing",
  "AgentSeatsTierPricing",
  "AgentValuePercentageTier",
  "ApplicationCoverage",
  "ApprovalHistory",
  "CancellationHistory",
  "Company",
  "CompanyAgent",
  "Customer",
  "CustomerAgent",
  "EndorsementApprovalHistory",
  "EndorsementChange",
  "EndorsementRequest",
  "InLeaseBacklog",
  "PartyAddress",
  "PartyVehicle",
  "Policy",
  "PolicyAddress",
  "PolicyApplication",
  "PolicyApplicationAddress",
  "PolicyApplicationChange",
  "PolicyApplicationVehicle",
  "PolicyCoverage",
  "PolicyQuotation",
  "PolicyQuotationAddress",
  "PolicyQuotationVehicle",
  "QuotationCoverage",
  "Role",
  "RolePermission",
  "User",
  "UserPermission",
  "UserRole",
  "Vehicle",
];

async function main() {
  const quoted = WIPE_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
  console.log(`Truncated ${WIPE_TABLES.length} tables.`);

  const permissions = await prisma.permission.findMany({ select: { id: true } });

  const role = await prisma.role.create({
    data: { role_name: "System Administrator", description: "Full system access" },
  });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ role_id: role.id, permission_id: p.id })),
  });
  console.log(`Created role "${role.role_name}" with ${permissions.length} permissions.`);

  const passwordHash = await bcrypt.hash("12345678", 12);
  const user = await prisma.user.create({
    data: {
      email: "ejnavarro555@gmail.com",
      password_hash: passwordHash,
      full_name: "System Admin",
      status: "ACTIVE",
    },
  });
  await prisma.userRole.create({ data: { user_id: user.id, role_id: role.id } });
  console.log(`Created user ${user.email} (no agent link).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
