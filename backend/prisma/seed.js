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
    code: "CREATE_APPLICATION",
    name: "Policy Application",
    group: "Policy Application",
    pageAccess: true,
    description: "Create and manage policy applications",
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
    { code: "PA", name: "Personal Accident", max: 200000 },
    { code: "AOG", name: "Acts of God", max: 500000 },
    { code: "OD", name: "Own Damage", max: 1000000 },
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
        update: { coverage_name: c.name, maximum_coverage: c.max, product_variant_id: variant.id },
        create: {
          coverage_code: coverageCode,
          coverage_name: c.name,
          maximum_coverage: c.max,
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
    { code: "FIRE", name: "Fire and Lightning", max: 2000000 },
    { code: "EQ", name: "Earthquake", max: 1000000 },
    { code: "FLD", name: "Flood", max: 1000000 },
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
        update: { coverage_name: c.name, maximum_coverage: c.max, product_variant_id: variant.id },
        create: {
          coverage_code: coverageCode,
          coverage_name: c.name,
          maximum_coverage: c.max,
          product_variant_id: variant.id,
          status: "ACTIVE",
        },
      });
    }
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
