require("dotenv").config();
const bcrypt = require("bcrypt");
const { PrismaClient } = require("../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// A code with no dot (e.g. "MANAGE_USERS") is a top-level, page-access
// permission; "PARENT.CHILD" (e.g. "MANAGE_USERS.ADD_USER") is a
// sub-permission scoped under that page — the hierarchy lives in the code
// string itself, not in separate grouping columns.
const PERMISSIONS = [
  { code: "MANAGE_USERS", name: "Manage Users", description: "View the Manage Users page and user list" },
  { code: "MANAGE_USERS.ADD_USER", name: "Add User", description: "Invite new user accounts" },
  { code: "MANAGE_USERS.EDIT_ROLE", name: "Edit Role", description: "Change a user's assigned role" },
  {
    code: "MANAGE_USERS.EDIT_SPECIAL_PERMISSIONS",
    name: "Edit Special Permissions",
    description: "Change a user's direct/special permission grants",
  },
  {
    code: "MANAGE_USERS.EDIT_USER_DETAILS",
    name: "Edit User Details",
    description: "Change a user's name, email, status, or reset their password",
  },
  { code: "MANAGE_AGENTS", name: "My Agents", description: "Access the My Agents page" },
  {
    code: "MANAGE_AGENTS.VIEW_AGENT_PREMIUMS",
    name: "View Premiums Generated",
    description: "See how much in premiums each agent has generated, all-time and in the last 30 days",
  },
  {
    code: "MANAGE_AGENTS.MANAGE_AGENT_RATES",
    name: "Manage Agent Rates",
    description: "See each agent's special rates and edit them",
  },
  {
    code: "MANAGE_AGENTS.ADD_AGENT",
    name: "Add Agent",
    description: "Register a new individual agent or agent company",
  },
  { code: "MANAGE_ACCOUNTING", name: "Accounting", description: "Access the Accounting page" },
  {
    code: "MANAGE_ACCOUNTING.RECORD_PAYMENT",
    name: "Record Payment",
    description: "Record a payment made against an agent's payable balance",
  },
  {
    code: "CREATE_APPLICATION",
    name: "Policy Application",
    description: "Create and manage policy applications",
  },
  {
    code: "CREATE_APPLICATION.AGENT_ISSUANCE",
    name: "Agent Issuance",
    description: "Submit and issue policy applications",
  },
  { code: "VIEW_POLICIES", name: "My Policies", description: "View issued policies" },
  {
    code: "VIEW_POLICIES.CREATE_ENDORSEMENT",
    name: "Create Endorsement Request",
    description: "File an endorsement request against one of your own issued policies",
  },
  { code: "MANAGE_INLEASE", name: "In-Lease Backlogs", description: "Manage the In-Lease backlog queue" },
  {
    code: "MANAGE_INLEASE.MARK_DONE",
    name: "Mark In-Lease Task Done",
    description: "Submit an in-lease backlog task as accomplished",
  },
  {
    code: "MANAGE_INLEASE.MARK_UNDONE",
    name: "Mark In-Lease Task Undone",
    description: "Revert an accomplished in-lease backlog task back to pending",
  },
  {
    code: "APPROVE_APPLICATION",
    name: "Policy Approval",
    description: "Approve or reject policy applications",
  },
  {
    code: "APPROVE_APPLICATION.ADMIN_POLICYAPPLICATION",
    name: "Admin Policy Application",
    description:
      "File a policy application under a chosen agent that is created and approved immediately, with the filer recorded as the approver",
  },
  {
    code: "APPROVE_ENDORSEMENT",
    name: "Endorsement Approval",
    description: "Review, amend, approve, or reject endorsement requests against issued policies",
  },
  { code: "MANAGE_SETTINGS", name: "Settings", description: "Access system settings" },
  {
    code: "MANAGE_SETTINGS.EDIT_ROLE_PERMISSIONS",
    name: "Edit Default Role Permissions",
    description: "Change which permissions a role grants by default",
  },
  {
    code: "MANAGE_SETTINGS.CREATE_ROLE",
    name: "Create Role",
    description: "Create a new role with a chosen set of default permissions",
  },
  {
    code: "MANAGE_SETTINGS.EDIT_CLAUSES",
    name: "Edit Clauses",
    description: "Edit the legal clause text attached to each coverage",
  },
  {
    code: "MANAGE_SETTINGS.MANAGE_PAYMENT_METHODS",
    name: "Manage Authorized Payment Methods",
    description: "Add or remove which payment methods Bethel accepts directly",
  },
  {
    code: "MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING",
    name: "Manage Coverage Pricing",
    description: "Choose how a coverage is priced and manage its value/tier pricing tables",
  },
  {
    code: "MANAGE_SETTINGS.MANAGE_PRODUCTS",
    name: "Manage Products",
    description: "Access the Manage Products page",
  },
  {
    code: "MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_CLASS",
    name: "Add/Remove Insurance Classes",
    description: "Create and remove insurance classes",
  },
  {
    code: "MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_VARIANT",
    name: "Add/Remove Product Variants",
    description: "Create and remove product variants",
  },
  {
    code: "MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_COVERAGE",
    name: "Add/Remove Coverages",
    description: "Create and remove coverages",
  },
  {
    code: "MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_DETAILS",
    name: "Edit Product Details",
    description: "Rename or re-code an insurance class, product variant, or coverage",
  },
  {
    code: "MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_PRICING",
    name: "Edit Pricing (Manage Products)",
    description: "Edit a product variant's rates and a coverage's pricing mode/rate/tiers from the Manage Products page",
  },
  { code: "QUOTATION_TRACKER", name: "Quotation Tracker", description: "Access the Quotation Tracker page" },
  {
    code: "QUOTATION_TRACKER.CREATE_QUOTATION",
    name: "Create Quotation",
    description: "Create a quotation under your own agent profile",
  },
  {
    code: "QUOTATION_TRACKER.VIEW_QUOTATION",
    name: "View Quotations",
    description: "See the quotations table, scoped to your own agent",
  },
  {
    code: "QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION",
    name: "Create Quotation (Any Agent)",
    description: "Create a quotation under an agent_id other than your own",
  },
  {
    code: "QUOTATION_TRACKER.ADMIN_VIEW_QUOTATION",
    name: "View All Quotations",
    description: "See every quotation in the system, regardless of agent",
  },
];

// Every seeded coverage is offered at these two standard periods — 6 months
// and 1 year — so the Policy Application page's period picker has more than
// one option to choose between out of the box.
const ALLOWABLE_PERIOD_DAYS = [180, 365];

// Returns the period rows keyed by their day count, so callers can look up
// (e.g.) the 365-day period's id to seed pricing against it.
async function seedAllowablePeriods(coverageId) {
  const periodsByDays = {};
  for (const days of ALLOWABLE_PERIOD_DAYS) {
    periodsByDays[days] = await prisma.coverageAllowablePeriod.upsert({
      where: { coverage_id_coverage_in_days: { coverage_id: coverageId, coverage_in_days: days } },
      update: {},
      create: { coverage_id: coverageId, coverage_in_days: days },
    });
  }
  return periodsByDays;
}

async function main() {
  const permissions = [];
  for (const p of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { permission_code: p.code },
      update: { permission_name: p.name, description: p.description },
      create: { permission_code: p.code, permission_name: p.name, description: p.description },
    });
    permissions.push(permission);
  }

  // One-time rename for existing databases seeded before this role was renamed.
  const legacyAdminRole = await prisma.role.findUnique({ where: { role_name: "ADMIN" } });
  if (legacyAdminRole) {
    await prisma.role.update({
      where: { id: legacyAdminRole.id },
      data: { role_name: "System Administrator" },
    });
  }

  const role = await prisma.role.upsert({
    where: { role_name: "System Administrator" },
    update: {},
    create: { role_name: "System Administrator", description: "Full system access" },
  });

  // System Administrator gets every permission in the system by default.
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { role_id_permission_id: { role_id: role.id, permission_id: permission.id } },
      update: {},
      create: { role_id: role.id, permission_id: permission.id },
    });
  }

  const passwordHash = await bcrypt.hash("Password123!", 12);

  const user = await prisma.user.upsert({
    where: { email: "admin@policyissuance.local" },
    update: {},
    create: {
      email: "admin@policyissuance.local",
      password_hash: passwordHash,
      full_name: "System Admin",
      status: "ACTIVE",
    },
  });

  await prisma.userRole.upsert({
    where: { user_id_role_id: { user_id: user.id, role_id: role.id } },
    update: {},
    create: { user_id: user.id, role_id: role.id },
  });

  const motorClass = await prisma.insuranceClass.upsert({
    where: { class_name: "Motor" },
    update: {},
    create: { class_name: "Motor", description: "Motor vehicle insurance", status: "ACTIVE" },
  });

  const VARIANTS = [
    { code: "PC", name: "Private Car" },
    { code: "CV", name: "Commercial Vehicle" },
    { code: "MC", name: "Motorcycle" },
  ];
  const COVERAGES = [
    {
      code: "PA",
      name: "Personal Accident",
      max: 200000,
      rate: 0.0025,
      clause:
        "This Company shall pay the Insured the benefits stated herein in the event of accidental bodily injury to any authorized passenger, including the driver, arising directly from an accident involving the insured vehicle, resulting in death or disablement within ninety (90) days from the date of the accident.",
    },
    {
      code: "AOG",
      name: "Acts of God",
      max: 500000,
      rate: 0.008,
      clause:
        "This Company shall indemnify the Insured against loss of or damage to the insured vehicle caused by earthquake, flood, typhoon, volcanic eruption, and other fortuitous events commonly classified as Acts of God, subject to the terms, conditions, and exclusions of this Policy.",
    },
    {
      code: "OD",
      name: "Own Damage",
      max: 1000000,
      rate: 0.03,
      clause:
        "This Company shall indemnify the Insured against accidental loss of or damage to the insured vehicle and its accessories, including the reasonable cost of towing to the nearest repair shop, subject to the excess/deductible stated in the Policy Schedule.",
    },
  ];

  for (const v of VARIANTS) {
    const variant = await prisma.productVariant.upsert({
      where: { variant_code: v.code },
      update: { variant_name: v.name, insurance_class_id: motorClass.id },
      create: {
        variant_code: v.code,
        variant_name: v.name,
        insurance_class_id: motorClass.id,
        status: "ACTIVE",
      },
    });

    for (const c of COVERAGES) {
      const coverageCode = `${v.code}_${c.code}`;
      const coverage = await prisma.productCoverage.upsert({
        where: { coverage_code: coverageCode },
        update: {
          coverage_name: c.name,
          maximum_coverage: c.max,
          clause: c.clause,
          product_variant_id: variant.id,
        },
        create: {
          coverage_code: coverageCode,
          coverage_name: c.name,
          maximum_coverage: c.max,
          clause: c.clause,
          product_variant_id: variant.id,
          status: "ACTIVE",
        },
      });
      const periods = await seedAllowablePeriods(coverage.id);
      // All pre-period pricing is treated as the 1-year price — seeded
      // against the 365-day period specifically, same as the migration that
      // backfilled every existing pricing row this way.
      await prisma.coveragePercentageBasedPricing.upsert({
        where: { coverage_allowable_period_id: periods[365].id },
        update: { standard_rate: c.rate },
        create: { coverage_allowable_period_id: periods[365].id, standard_rate: c.rate },
      });
    }
  }

  const propertyClass = await prisma.insuranceClass.upsert({
    where: { class_name: "Property" },
    update: {},
    create: { class_name: "Property", description: "Property insurance", status: "ACTIVE" },
  });

  const PROPERTY_VARIANTS = [{ code: "RF", name: "Residential Fire" }];
  const PROPERTY_COVERAGES = [
    {
      code: "FIRE",
      name: "Fire and Lightning",
      max: 2000000,
      rate: 0.002,
      clause:
        "This Company shall indemnify the Insured against loss or damage to the property described herein caused by fire, lightning, and explosion arising therefrom, subject to the terms, conditions, and exclusions of this Policy.",
    },
    {
      code: "EQ",
      name: "Earthquake",
      max: 1000000,
      rate: 0.001,
      clause:
        "This Company shall indemnify the Insured against loss or damage to the property described herein directly caused by earthquake, volcanic eruption, or tsunami, subject to a deductible of two percent (2%) of the sum insured per occurrence.",
    },
    {
      code: "FLD",
      name: "Flood",
      max: 1000000,
      rate: 0.0015,
      clause:
        "This Company shall indemnify the Insured against loss or damage to the property described herein directly caused by flood, typhoon, or windstorm, subject to the terms, conditions, and exclusions of this Policy.",
    },
  ];

  for (const v of PROPERTY_VARIANTS) {
    const variant = await prisma.productVariant.upsert({
      where: { variant_code: v.code },
      update: { variant_name: v.name, insurance_class_id: propertyClass.id },
      create: {
        variant_code: v.code,
        variant_name: v.name,
        insurance_class_id: propertyClass.id,
        status: "ACTIVE",
      },
    });

    for (const c of PROPERTY_COVERAGES) {
      const coverageCode = `${v.code}_${c.code}`;
      const coverage = await prisma.productCoverage.upsert({
        where: { coverage_code: coverageCode },
        update: {
          coverage_name: c.name,
          maximum_coverage: c.max,
          clause: c.clause,
          product_variant_id: variant.id,
        },
        create: {
          coverage_code: coverageCode,
          coverage_name: c.name,
          maximum_coverage: c.max,
          clause: c.clause,
          product_variant_id: variant.id,
          status: "ACTIVE",
        },
      });
      const periods = await seedAllowablePeriods(coverage.id);
      await prisma.coveragePercentageBasedPricing.upsert({
        where: { coverage_allowable_period_id: periods[365].id },
        update: { standard_rate: c.rate },
        create: { coverage_allowable_period_id: periods[365].id, standard_rate: c.rate },
      });
    }
  }

  const BETHEL_PAYMENT_METHODS = ["Bank Deposit — BDO", "Bank Deposit — BPI", "GCash", "Maya", "Over-the-Counter"];
  for (const name of BETHEL_PAYMENT_METHODS) {
    await prisma.authorizedPaymentMethod.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log("Seed complete. Log in with:");
  console.log("  email:    admin@policyissuance.local");
  console.log("  password: Password123!");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
