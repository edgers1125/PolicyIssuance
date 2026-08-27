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

module.exports = { requirePermission, getUserPermissionCodes };
