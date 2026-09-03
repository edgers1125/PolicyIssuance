require("dotenv").config();
const bcrypt = require("bcrypt");
const { PrismaClient } = require("../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PERMISSIONS = [
  {
    code: "MANAGE_USERS",
    name: "Manage Users",
    group: "Manage Users",
    pageAccess: true,
    description: "View the Manage Users page and user list",
  },
  { code: "ADD_USER", name: "Add User", group: "Manage Users", description: "Invite new user accounts" },
  {
    code: "EDIT_ROLE",
    name: "Edit Role",
    group: "Manage Users",
    description: "Change a user's assigned role",
  },
  {
    code: "EDIT_SPECIAL_PERMISSIONS",
    name: "Edit Special Permissions",
    group: "Manage Users",
    description: "Change a user's direct/special permission grants",
  },
  {
    code: "EDIT_USER_DETAILS",
    name: "Edit User Details",
    group: "Manage Users",
    description: "Change a user's name, email, status, or reset their password",
  },
  {
    code: "MANAGE_AGENTS",
    name: "My Agents",
    group: "My Agents",
    pageAccess: true,
    description: "Access the My Agents page",
  },
  {
    code: "VIEW_AGENT_PREMIUMS",
    name: "View Premiums Generated",
    group: "My Agents",
    description: "See how much in premiums each agent has generated, all-time and in the last 30 days",
  },
  {
    code: "MANAGE_AGENT_RATES",
    name: "Manage Agent Rates",
    group: "My Agents",
    description: "See each agent's special rates and edit them",
  },
  {
    code: "CREATE_APPLICATION",
    name: "Policy Application",
    group: "Policy Application",
    pageAccess: true,
    description: "Create and manage policy applications",
  },
  {
    code: "AGENT_ISSUANCE",
    name: "Agent Issuance",
    group: "Policy Application",
    description: "Submit and issue policy applications",
  },
  {
    code: "VIEW_POLICIES",
    name: "My Policies",
    group: "My Policies",
    pageAccess: true,
    description: "View issued policies",
  },
  {
    code: "MANAGE_INLEASE",
    name: "In-Lease Backlogs",
    group: "In-Lease Backlogs",
    pageAccess: true,
    description: "Manage the In-Lease backlog queue",
  },
  {
    code: "APPROVE_APPLICATION",
    name: "Policy Approval",
    group: "Policy Approval",
    pageAccess: true,
    description: "Approve or reject policy applications",
  },
  {
    code: "MANAGE_SETTINGS",
    name: "Settings",
    group: "Settings",
    pageAccess: true,
    description: "Access system settings",
  },
  {
    code: "EDIT_ROLE_PERMISSIONS",
    name: "Edit Default Role Permissions",
    group: "Settings",
    description: "Change which permissions a role grants by default",
  },
  {
    code: "CREATE_ROLE",
    name: "Create Role",
    group: "Settings",
    description: "Create a new role with a chosen set of default permissions",
  },
  {
    code: "EDIT_CLAUSES",
    name: "Edit Clauses",
    group: "Settings",
    description: "Edit the legal clause text attached to each coverage",
  },
  {
    code: "EDIT_COVERAGE_DEFAULTS",
    name: "Edit Coverage Defaults",
    group: "Settings",
    description: "Edit each coverage's standard rate and maximum coverage",
  },
  {
    code: "MANAGE_PAYMENT_METHODS",
    name: "Manage Authorized Payment Methods",
    group: "Settings",
    description: "Add or remove which payment methods Bethel accepts directly",
  },
];

async function main() {
  const permissions = [];
  for (const p of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { permission_code: p.code },
      update: {
        permission_name: p.name,
        page_group: p.group,
        is_page_access: Boolean(p.pageAccess),
        description: p.description,
      },
      create: {
        permission_code: p.code,
        permission_name: p.name,
        page_group: p.group,
        is_page_access: Boolean(p.pageAccess),
        description: p.description,
      },
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
      await prisma.productCoverage.upsert({
        where: { coverage_code: coverageCode },
        update: {
          coverage_name: c.name,
          maximum_coverage: c.max,
          standard_rate: c.rate,
          clause: c.clause,
          product_variant_id: variant.id,
        },
        create: {
          coverage_code: coverageCode,
          coverage_name: c.name,
          maximum_coverage: c.max,
          standard_rate: c.rate,
          clause: c.clause,
          product_variant_id: variant.id,
          status: "ACTIVE",
        },
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
      await prisma.productCoverage.upsert({
        where: { coverage_code: coverageCode },
        update: {
          coverage_name: c.name,
          maximum_coverage: c.max,
          standard_rate: c.rate,
          clause: c.clause,
          product_variant_id: variant.id,
        },
        create: {
          coverage_code: coverageCode,
          coverage_name: c.name,
          maximum_coverage: c.max,
          standard_rate: c.rate,
          clause: c.clause,
          product_variant_id: variant.id,
          status: "ACTIVE",
        },
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
