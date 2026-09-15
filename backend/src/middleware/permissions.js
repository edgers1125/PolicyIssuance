const prisma = require("../lib/prisma");

// Union of permissions granted via the user's roles and any permissions
// granted directly to the user (user_permissions acts as an override/extra grant).
// An INACTIVE or SUSPENDED account loses every permission — dashboard-only —
// regardless of what its roles/special grants would otherwise provide.
async function getUserPermissionCodes(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user || user.status === "INACTIVE" || user.status === "SUSPENDED") {
    return new Set();
  }

  const [roleGrants, directGrants] = await Promise.all([
    prisma.userRole.findMany({
      where: { user_id: userId },
      select: {
        role: {
          select: {
            role_permissions: {
              select: { permission: { select: { permission_code: true } } },
            },
          },
        },
      },
    }),
    prisma.userPermission.findMany({
      where: { user_id: userId },
      select: { permission: { select: { permission_code: true } } },
    }),
  ]);

  const codes = new Set();
  for (const grant of roleGrants) {
    for (const rp of grant.role.role_permissions) {
      codes.add(rp.permission.permission_code);
    }
  }
  for (const grant of directGrants) {
    codes.add(grant.permission.permission_code);
  }

  return codes;
}

function requirePermission(permissionCode) {
  return async (req, res, next) => {
    try {
      const codes = await getUserPermissionCodes(req.user.userId);
      if (!codes.has(permissionCode)) {
        return res.status(403).json({ error: `Missing required permission: ${permissionCode}` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Passes once ANY of the given codes is held — for a route (or, as here,
// a whole shared router) that legitimately serves more than one feature
// with its own separate permission, e.g. catalog.js's GET /product-catalog
// and customers.js/companies.js/vehicles.js/addresses.js's party/vehicle/
// address lookups: both PolicyApplication.jsx (CREATE_APPLICATION) and
// QuotationCreator.jsx (QUOTATION_TRACKER.CREATE_QUOTATION/
// ADMIN_CREATE_QUOTATION) need them during intake, and neither permission
// system should have to grant the other's page access just to reuse them.
function requireAnyPermission(permissionCodes) {
  return async (req, res, next) => {
    try {
      const codes = await getUserPermissionCodes(req.user.userId);
      if (!permissionCodes.some((c) => codes.has(c))) {
        return res.status(403).json({ error: `Missing required permission: one of ${permissionCodes.join(", ")}` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// For the field-group case a route-level requirePermission() can't express —
// e.g. a single PATCH where different fields need different grants. Returns
// whether the check passed; the caller must `return` immediately when it's false.
function ensurePermission(res, permissionCodes, permissionCode) {
  if (permissionCodes.has(permissionCode)) return true;
  res.status(403).json({ error: `Missing required permission: ${permissionCode}` });
  return false;
}

// Every permission that unlocks the shared intake building blocks (product
// catalog, customer/company/vehicle/address lookup+create) used while
// filling out either a policy application or a quotation — kept in one
// place so catalog.js/customers.js/companies.js/vehicles.js/addresses.js
// don't each hand-roll their own copy of this list and drift out of sync.
const INTAKE_PERMISSIONS = [
  "CREATE_APPLICATION",
  "QUOTATION_TRACKER.CREATE_QUOTATION",
  "QUOTATION_TRACKER.ADMIN_CREATE_QUOTATION",
];

module.exports = { requirePermission, requireAnyPermission, ensurePermission, getUserPermissionCodes, INTAKE_PERMISSIONS };
