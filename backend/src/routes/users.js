const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, ensurePermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody } = require("../middleware/validate");
const {
  createRoleSchema,
  createUserSchema,
  updateUserSchema,
  updateRolePermissionsSchema,
} = require("../schemas/users");
const { sendMail } = require("../lib/mailer");

// Shared by the new-user invite and the re-verification (email/password
// change) cases below — both are "here's your link to set a password" mail,
// just with different framing copy.
async function sendInviteEmail(email, link, { isNew }) {
  const intro = isNew
    ? "An account has been created for you on Bethel Policy Issuance."
    : "Your Bethel Policy Issuance account needs a new password before you can sign in again.";
  const cta = isNew ? "Set your password to get started" : "Set your new password";

  await sendMail({
    to: email,
    subject: isNew ? "You've been invited to Bethel Policy Issuance" : "Set your new Bethel Policy Issuance password",
    html: `
      <div style="font-family:Arial,sans-serif;color:#111">
        <p>${intro}</p>
        <p><a href="${link}">${cta}</a>. This link expires in 7 days.</p>
      </div>
    `,
    text: [intro, "", `${cta}: ${link}`, "", "This link expires in 7 days."].join("\n"),
  });
}

const router = express.Router();

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Each top-level, dot-free permission code (e.g. "MANAGE_USERS") is a hidden
// "page access" permission that isn't shown in the UI — granting any of its
// sub-permissions ("MANAGE_USERS.ADD_USER") automatically grants the parent
// too, so the grantee can actually reach the page it lives on.
async function expandWithPageAccess(permissionIds) {
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
    return permissionIds || [];
  }

  const selected = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { permission_code: true },
  });

  const parentCodes = new Set();
  for (const { permission_code } of selected) {
    const dotIndex = permission_code.indexOf(".");
    if (dotIndex !== -1) {
      parentCodes.add(permission_code.slice(0, dotIndex));
    }
  }

  const result = new Set(permissionIds);
  if (parentCodes.size > 0) {
    const parents = await prisma.permission.findMany({
      where: { permission_code: { in: Array.from(parentCodes) } },
      select: { id: true },
    });
    for (const p of parents) {
      result.add(p.id);
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
        customer_id: true,
        agent: { select: { id: true, agent_code: true, agent_name: true, status: true } },
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
            permission: {
              select: { id: true, permission_code: true, permission_name: true },
            },
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
        is_customer: Boolean(u.customer_id),
        agent: u.agent,
        roles: u.user_roles.map((ur) => ({ id: ur.role.id, role_name: ur.role.role_name })),
        permissions: Array.from(rolePermissionsById.values()),
        // Page access is implicit/hidden — only surface the real sub-permissions
        // here, i.e. codes with a dot ("PARENT.CHILD"), never a bare top-level code.
        specialPermissions: u.user_permissions
          .map((up) => up.permission)
          .filter((p) => p.permission_code.includes("."))
          .map(({ id, permission_code, permission_name }) => ({ id, permission_code, permission_name })),
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
    const allPermissions = await prisma.permission.findMany({
      select: { id: true, permission_code: true, permission_name: true, description: true },
    });
    const nameByCode = new Map(allPermissions.map((p) => [p.permission_code, p.permission_name]));

    const permissions = allPermissions
      // Page-access permissions (no dot in the code) are implicit — auto-granted
      // whenever a sub-permission under them is granted — never shown for manual
      // selection.
      .filter((p) => p.permission_code.includes("."))
      .map((p) => {
        const parentCode = p.permission_code.split(".")[0];
        return {
          id: p.id,
          permission_code: p.permission_code,
          permission_name: p.permission_name,
          description: p.description,
          // Human-friendly grouping for display, derived from the parent
          // page's own name rather than a separately maintained value.
          group_name: nameByCode.get(parentCode) || parentCode,
        };
      })
      .sort((a, b) => a.group_name.localeCompare(b.group_name) || a.permission_name.localeCompare(b.permission_name));

    res.json(permissions);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/roles",
  requirePermission("MANAGE_SETTINGS.CREATE_ROLE"),
  validateBody(createRoleSchema),
  async (req, res, next) => {
    try {
      const { role_name, description, permission_ids } = req.body;

      const existing = await prisma.role.findUnique({ where: { role_name } });
      if (existing) {
        return res.status(409).json({ error: "A role with this name already exists" });
      }

      const expandedPermissionIds = await expandWithPageAccess(permission_ids);

      const role = await prisma.role.create({
        data: {
          role_name,
          description: description || null,
          role_permissions:
            expandedPermissionIds.length > 0
              ? { create: expandedPermissionIds.map((permission_id) => ({ permission_id })) }
              : undefined,
        },
        select: { id: true, role_name: true, description: true },
      });

      res.status(201).json(role);
    } catch (err) {
      next(err);
    }
  }
);

router.post("/", requirePermission("MANAGE_USERS"), validateBody(createUserSchema), async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensurePermission(res, actingPermissions, "MANAGE_USERS.ADD_USER")) return;

    const { email, first_name, last_name, role_id, permission_ids, make_agent, agent_code } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "A user with this email already exists" });
    }

    const role = await prisma.role.findUnique({ where: { id: role_id } });
    if (!role) {
      return res.status(400).json({ error: "role_id does not match an existing role" });
    }

    if (make_agent) {
      const existingAgentCode = await prisma.agent.findUnique({ where: { agent_code } });
      if (existingAgentCode) {
        return res.status(409).json({ error: "An agent with this agent code already exists" });
      }
      const existingAgentEmail = await prisma.agent.findUnique({ where: { work_email: email } });
      if (existingAgentEmail) {
        return res.status(409).json({ error: "An agent with this work email already exists" });
      }
    }

    const full_name = `${first_name} ${last_name}`;
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const expandedPermissionIds = await expandWithPageAccess(permission_ids);

    const user = await prisma.$transaction(async (tx) => {
      // Every user is also a customer — reuse an existing customer record with a
      // matching email (e.g. one an agent already filed applications for) rather
      // than creating a duplicate, otherwise create a fresh one.
      let customerId;
      const existingCustomer = await tx.customer.findUnique({ where: { email } });
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const customer = await tx.customer.create({
          data: { first_name, last_name, email, status: "ACTIVE" },
          select: { id: true },
        });
        customerId = customer.id;
      }

      let agentId;
      if (make_agent) {
        const agent = await tx.agent.create({
          data: { agent_code, agent_name: full_name, work_email: email, status: "ACTIVE" },
          select: { id: true },
        });
        agentId = agent.id;
      }

      return tx.user.create({
        data: {
          email,
          full_name,
          status: "AWAITING_EMAIL_VERIFICATION",
          invite_token: inviteToken,
          invite_token_expires_at: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
          customer_id: customerId,
          agent_id: agentId,
          user_roles: { create: { role_id } },
          user_permissions: expandedPermissionIds.length > 0
            ? { create: expandedPermissionIds.map((permission_id) => ({ permission_id })) }
            : undefined,
        },
        select: { id: true, email: true, full_name: true, status: true },
      });
    });

    const inviteLink = `${process.env.FRONTEND_URL}/set-password?token=${inviteToken}`;

    // Always log the link too — the fallback the UI already relies on
    // (a manually-shareable link) if SMTP is down or unconfigured, so a
    // failed/unsent email doesn't block onboarding this user.
    console.log(`[email] Invite link for ${email}: ${inviteLink}`);

    let emailSent = false;
    try {
      await sendInviteEmail(email, inviteLink, { isNew: true });
      emailSent = true;
    } catch (mailErr) {
      console.error(`[email] Failed to send invite email to ${email}:`, mailErr.message || mailErr);
    }

    res.status(201).json({ user, inviteLink, emailSent });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requirePermission("MANAGE_USERS"), validateBody(updateUserSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { full_name, email, status, role_id, permission_ids, reset_password, make_agent, agent_code } = req.body;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const actingPermissions = await getUserPermissionCodes(req.user.userId);

    const wantsDetailsChange =
      full_name !== undefined || email !== undefined || status !== undefined || reset_password || make_agent;
    if (wantsDetailsChange && !ensurePermission(res, actingPermissions, "MANAGE_USERS.EDIT_USER_DETAILS")) return;
    if (role_id !== undefined && !ensurePermission(res, actingPermissions, "MANAGE_USERS.EDIT_ROLE")) return;
    if (
      permission_ids !== undefined &&
      !ensurePermission(res, actingPermissions, "MANAGE_USERS.EDIT_SPECIAL_PERMISSIONS")
    )
      return;

    if (make_agent && targetUser.agent_id) {
      return res.status(409).json({ error: "This user is already an agent" });
    }
    if (make_agent && !agent_code) {
      return res.status(400).json({ error: "agent_code is required to make this user an agent" });
    }
    if (make_agent) {
      const existingAgentCode = await prisma.agent.findUnique({ where: { agent_code } });
      if (existingAgentCode) {
        return res.status(409).json({ error: "An agent with this agent code already exists" });
      }
      const workEmail = email !== undefined ? email : targetUser.email;
      const existingAgentEmail = await prisma.agent.findUnique({ where: { work_email: workEmail } });
      if (existingAgentEmail) {
        return res.status(409).json({ error: "An agent with this work email already exists" });
      }
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

    if (make_agent) {
      const agent = await prisma.agent.create({
        data: {
          agent_code,
          agent_name: data.full_name || targetUser.full_name,
          work_email: data.email || targetUser.email,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      data.agent_id = agent.id;
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

    let emailSent = false;
    if (inviteLink) {
      const targetEmail = data.email || targetUser.email;
      // Same fallback as user creation — always log the link so it can be
      // shared manually if the send below fails.
      console.log(`[email] Re-verification link for ${targetEmail}: ${inviteLink}`);
      try {
        await sendInviteEmail(targetEmail, inviteLink, { isNew: false });
        emailSent = true;
      } catch (mailErr) {
        console.error(`[email] Failed to send re-verification email to ${targetEmail}:`, mailErr.message || mailErr);
      }
    }

    res.json({ message: "User updated", inviteLink, emailSent });
  } catch (err) {
    next(err);
  }
});

router.put(
  "/roles/:id/permissions",
  requirePermission("MANAGE_SETTINGS.EDIT_ROLE_PERMISSIONS"),
  validateBody(updateRolePermissionsSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { permission_ids } = req.body;

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
  }
);

module.exports = router;
