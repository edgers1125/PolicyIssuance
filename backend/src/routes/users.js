const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, getUserPermissionCodes } = require("../middleware/permissions");

const router = express.Router();

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Each page has one hidden "page access" permission (is_page_access: true) that
// isn't shown in the UI — granting any other permission belonging to that page
// automatically grants page access too, so the grantee can actually reach the page.
async function expandWithPageAccess(permissionIds) {
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
    return permissionIds || [];
  }

  const allPermissions = await prisma.permission.findMany({
    select: { id: true, page_group: true, is_page_access: true },
  });
  const byId = new Map(allPermissions.map((p) => [p.id, p]));
  const pageAccessIdByGroup = new Map(
    allPermissions.filter((p) => p.is_page_access).map((p) => [p.page_group, p.id])
  );

  const result = new Set(permissionIds);
  for (const id of permissionIds) {
    const perm = byId.get(id);
    if (!perm) continue;
    const pageAccessId = pageAccessIdByGroup.get(perm.page_group);
    if (pageAccessId) {
      result.add(pageAccessId);
    }
  }
  return Array.from(result);
}

router.use(requireAuth);

router.get("/", requirePermission("MANAGE_USERS"), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        email: true,
        full_name: true,
        status: true,
        created_at: true,
        user_roles: {
          select: {
            role: {
              select: {
                id: true,
                role_name: true,
                role_permissions: {
                  select: {
                    permission: { select: { id: true, permission_code: true, permission_name: true } },
                  },
                },
              },
            },
          },
        },
        user_permissions: {
          select: {
            permission: { select: { id: true, permission_code: true, permission_name: true } },
          },
        },
      },
    });

    const result = users.map((u) => {
      const rolePermissionsById = new Map();
      for (const ur of u.user_roles) {
        for (const rp of ur.role.role_permissions) {
          rolePermissionsById.set(rp.permission.id, rp.permission);
        }
      }

      return {
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        status: u.status,
        created_at: u.created_at,
        roles: u.user_roles.map((ur) => ({ id: ur.role.id, role_name: ur.role.role_name })),
        permissions: Array.from(rolePermissionsById.values()),
        specialPermissions: u.user_permissions.map((up) => up.permission),
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/roles", async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { role_name: "asc" },
      select: {
        id: true,
        role_name: true,
        description: true,
        role_permissions: { select: { permission_id: true } },
      },
    });
    res.json(
      roles.map((r) => ({
        id: r.id,
        role_name: r.role_name,
        description: r.description,
        permissionIds: r.role_permissions.map((rp) => rp.permission_id),
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.get("/permissions", async (req, res, next) => {
  try {
    const permissions = await prisma.permission.findMany({
      // Page-access permissions are implicit (auto-granted whenever another
      // permission on that page is granted) — never shown for manual selection.
      where: { is_page_access: false },
      orderBy: [{ page_group: "asc" }, { permission_name: "asc" }],
      select: {
        id: true,
        permission_code: true,
        permission_name: true,
        page_group: true,
        description: true,
      },
    });
    res.json(permissions);
  } catch (err) {
    next(err);
  }
});

router.post("/roles", requirePermission("CREATE_ROLE"), async (req, res, next) => {
  try {
    const { role_name, description, permission_ids } = req.body;

    if (!role_name) {
      return res.status(400).json({ error: "role_name is required" });
    }

    const existing = await prisma.role.findUnique({ where: { role_name } });
    if (existing) {
      return res.status(409).json({ error: "A role with this name already exists" });
    }

    const expandedPermissionIds = await expandWithPageAccess(permission_ids);

    const role = await prisma.role.create({
      data: {
        role_name,
        description: description || null,
        role_permissions: expandedPermissionIds.length > 0
          ? { create: expandedPermissionIds.map((permission_id) => ({ permission_id })) }
          : undefined,
      },
      select: { id: true, role_name: true, description: true },
    });

    res.status(201).json(role);
  } catch (err) {
    next(err);
  }
});

router.post("/", requirePermission("MANAGE_USERS"), async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!actingPermissions.has("ADD_USER")) {
      return res.status(403).json({ error: "Missing required permission: ADD_USER" });
    }

    const { email, full_name, role_id, permission_ids } = req.body;

    if (!email || !full_name || !role_id) {
      return res.status(400).json({ error: "email, full_name, and role_id are required" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "A user with this email already exists" });
    }

    const role = await prisma.role.findUnique({ where: { id: role_id } });
    if (!role) {
      return res.status(400).json({ error: "role_id does not match an existing role" });
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");
    const expandedPermissionIds = await expandWithPageAccess(permission_ids);

    const user = await prisma.user.create({
      data: {
        email,
        full_name,
        status: "AWAITING_EMAIL_VERIFICATION",
        invite_token: inviteToken,
        invite_token_expires_at: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
        user_roles: { create: { role_id } },
        user_permissions: expandedPermissionIds.length > 0
          ? { create: expandedPermissionIds.map((permission_id) => ({ permission_id })) }
          : undefined,
      },
      select: { id: true, email: true, full_name: true, status: true },
    });

    const inviteLink = `${process.env.FRONTEND_URL}/set-password?token=${inviteToken}`;

    // No email provider configured yet — log the link and return it so the
    // invite flow can be tested end-to-end without real email delivery.
    console.log(`[mock email] Invite link for ${email}: ${inviteLink}`);

    res.status(201).json({ user, inviteLink });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requirePermission("MANAGE_USERS"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { full_name, email, status, role_id, permission_ids, reset_password } = req.body;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const actingPermissions = await getUserPermissionCodes(req.user.userId);

    const wantsDetailsChange =
      full_name !== undefined || email !== undefined || status !== undefined || reset_password;
    if (wantsDetailsChange && !actingPermissions.has("EDIT_USER_DETAILS")) {
      return res.status(403).json({ error: "Missing required permission: EDIT_USER_DETAILS" });
    }
    if (role_id !== undefined && !actingPermissions.has("EDIT_ROLE")) {
      return res.status(403).json({ error: "Missing required permission: EDIT_ROLE" });
    }
    if (permission_ids !== undefined && !actingPermissions.has("EDIT_SPECIAL_PERMISSIONS")) {
      return res.status(403).json({ error: "Missing required permission: EDIT_SPECIAL_PERMISSIONS" });
    }

    const data = {};
    if (full_name !== undefined) data.full_name = full_name;
    if (status !== undefined) data.status = status;

    let needsReverification = Boolean(reset_password);

    if (email !== undefined && email !== targetUser.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== id) {
        return res.status(409).json({ error: "A user with this email already exists" });
      }
      data.email = email;
      needsReverification = true;
    }

    let inviteLink;
    if (needsReverification) {
      const inviteToken = crypto.randomBytes(32).toString("hex");
      data.password_hash = null;
      data.status = "AWAITING_EMAIL_VERIFICATION";
      data.email_verified_at = null;
      data.invite_token = inviteToken;
      data.invite_token_expires_at = new Date(Date.now() + INVITE_TOKEN_TTL_MS);
      inviteLink = `${process.env.FRONTEND_URL}/set-password?token=${inviteToken}`;
    }

    await prisma.user.update({ where: { id }, data });

    if (role_id !== undefined) {
      await prisma.userRole.deleteMany({ where: { user_id: id } });
      await prisma.userRole.create({ data: { user_id: id, role_id } });
    }

    if (permission_ids !== undefined) {
      const expandedPermissionIds = await expandWithPageAccess(permission_ids);
      await prisma.userPermission.deleteMany({ where: { user_id: id } });
      if (expandedPermissionIds.length > 0) {
        await prisma.userPermission.createMany({
          data: expandedPermissionIds.map((permission_id) => ({ user_id: id, permission_id })),
        });
      }
    }

    if (inviteLink) {
      console.log(`[mock email] Re-verification link for ${data.email || targetUser.email}: ${inviteLink}`);
    }

    res.json({ message: "User updated", inviteLink });
  } catch (err) {
    next(err);
  }
});

router.put("/roles/:id/permissions", requirePermission("EDIT_ROLE_PERMISSIONS"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { permission_ids } = req.body;

    if (!Array.isArray(permission_ids)) {
      return res.status(400).json({ error: "permission_ids must be an array" });
    }

    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    const expandedPermissionIds = await expandWithPageAccess(permission_ids);

    // Replace the role's permission set entirely: drop whatever isn't in the
    // new list, add whatever's newly checked.
    await prisma.rolePermission.deleteMany({ where: { role_id: id } });
    if (expandedPermissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: expandedPermissionIds.map((permission_id) => ({ role_id: id, permission_id })),
      });
    }

    res.json({ message: "Role permissions updated" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
