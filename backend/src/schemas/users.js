const { z } = require("zod");
const { requiredString, requiredEmail } = require("./common");

const USER_STATUSES = ["AWAITING_EMAIL_VERIFICATION", "ACTIVE", "INACTIVE", "SUSPENDED"];

const createRoleSchema = z.object({
  role_name: requiredString("role_name"),
  description: z.string().optional(),
  permission_ids: z.array(z.string()).optional(),
});

const createUserSchema = z.object({
  email: requiredEmail(),
  first_name: requiredString("first_name"),
  last_name: requiredString("last_name"),
  role_id: requiredString("role_id"),
  permission_ids: z.array(z.string()).optional(),
  // Links to an already-existing INDIVIDUAL agent (picked from GET
  // /users/agents) rather than creating a new one inline — agents are now
  // only ever created via My Agents' own "Add Agent"/"Add Company" action
  // (POST /agents), so a user is connected to one, not the other way around.
  agent_id: z.string().uuid("agent_id must be a valid UUID").optional(),
});

// A PATCH only ever touches whichever fields are present — each one is
// optional here, and the route independently checks the caller has
// permission for whichever field group they're actually changing. agent_id
// is nullable (unlike create's) so an existing link can be explicitly
// cleared, not just set.
const updateUserSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email("email must be a valid email address").optional(),
  status: z.enum(USER_STATUSES).optional(),
  role_id: z.string().min(1).optional(),
  permission_ids: z.array(z.string()).optional(),
  reset_password: z.boolean().optional(),
  agent_id: z.string().uuid("agent_id must be a valid UUID").nullable().optional(),
});

const updateRolePermissionsSchema = z.object({
  permission_ids: z.array(z.string()),
});

module.exports = { createRoleSchema, createUserSchema, updateUserSchema, updateRolePermissionsSchema };
